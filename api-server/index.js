const express = require('express')
const {generateSlug} = require('random-word-slugs')
const {ECSClient, RunTaskCommand} = require('@aws-sdk/client-ecs')
const Redis = require('ioredis')
const { Server } = require('socket.io')
const {z} = require('zod')
const app = express()
const PORT = 9000
const {PrismaClient} = require('@prisma/client')
const subscriber = new Redis('rediss://default:AVNS_Qrby43-ITir9eHjzD2R@redis-41014eb-yagnapatelhirenk-e786.d.aivencloud.com:18255')
const io = new Server({ cors: '*' })

const prisma = new PrismaClient()

io.on('connection', socket => {
    socket.on('subscribe', channel => {
        socket.join(channel)
        socket.emit('message', `Joined ${channel}`)
    })
})
io.listen(9002, () => console.log('Socket Server 9002'))

const ecsClient = new ECSClient({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIA4MTWLSW6QTDAORMF',
        secretAccessKey: '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'
    }
})

const config = {
    CLUSTER:'arn:aws:ecs:ap-south-1:851725489597:cluster/build-cluster',
    TASK:'arn:aws:ecs:ap-south-1:851725489597:task-definition/build-task'
}

app.use(express.json())

app.post('/project',async(req,res)=>{
  const schema = z.object({
    name:z.string(),
    gitURL: z.string()
  })
  const safeParseResult = schema.safeParse(req.body)
  if(safeParseResult.error) return res.status(400).json({error: safeParseResult.error})
  const {name,gitURL} = safeParseResult.data

  const project = await prisma.project.create({
    data: {
        name,
        gitURL,
        subDomain: generateSlug()
    }
})
  return res.json({ status: 'success',data:{project}})
})

app.post('/deploy',async (req,res)=>{
  const { projectId } = req.body

  const project = await prisma.project.findUnique({ where: { id: projectId } })

  if (!project) return res.status(404).json({ error: 'Project not found' })

  // Check if there is no running deployement
  const deployment = await prisma.deployment.create({
      data: {
          project: { connect: { id: projectId } },
          status: 'QUEUED',
      }
  })
    //spin the container
    const command = new RunTaskCommand({
        cluster: config.CLUSTER,
        taskDefinition: config.TASK,
        launchType: 'FARGATE',
        count: 1,
        networkConfiguration: { // NetworkConfiguration
            awsvpcConfiguration: { // AwsVpcConfiguration
              subnets: [ // StringList // required
                "subnet-007f82446b62123db","subnet-07ec49aa6973e505e","subnet-0c7aaddac02541617"
              ],
              securityGroups: [
                "sg-0755f5b93982e4669",
              ],
              assignPublicIp: "ENABLED",
            },
          },
          overrides: {
            containerOverrides: [
                { // ContainerOverride
                    name: "build-image",
                    environment: [ // EnvironmentVariables
                      { // KeyValuePair
                        name: "GIT_REPOSITORY__URL",
                        value: project.gitURL,
                      },
                      { // KeyValuePair
                        name: "PROJECT_ID",
                        value: project.subDomain,
                      },
                      { // KeyValuePair
                        name: "DEPLOYMENT_ID",
                        value: deployment.id,
                      },
                    ],
                },
            ]
          }
    })
    await ecsClient.send(command);
    return res.json({ status: 'queued', data: { deploymentId: deployment.id,domain: project.subDomain} })})

async function initRedisSubscribe() {
    console.log('Subscribed to logs....')
    subscriber.psubscribe('logs:*')
    subscriber.on('pmessage', (pattern, channel, message) => {
        io.to(channel).emit('message', message)
    })
}

initRedisSubscribe()

app.listen(PORT,()=>console.log("API server running on port : ",PORT))