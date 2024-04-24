const {exec} = require('child_process')
const path = require('path')
const fs = require('fs')
const {S3Client, PutObjectCommand} = require('@aws-sdk/client-s3')
const mime = require('mime-types');
const Redis = require('ioredis')

console.log("executing script.js")

const publisher = new Redis('rediss://default:AVNS_Qrby43-ITir9eHjzD2R@redis-41014eb-yagnapatelhirenk-e786.d.aivencloud.com:18255')

const s3Client = new S3Client({
    region: 'ap-south-1',
    credentials: {
        accessKeyId: 'AKIA4MTWLSW6QTDAORMF',
        secretAccessKey: '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'
    }
})

const PROJECT_ID = process.env.PROJECT_ID

function publishLog(log) {
    publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
}

async function init() {
    console.log("Executing script.js")
    publishLog('Build Started...')
    const outDirPath = path.join(__dirname,'output')

    const p = exec(`cd ${outDirPath} && npm install && npm run build`)

    p.stdout.on('data', function(data) {
        console.log(data.toString())
        publishLog(data.toString())
    })

    p.stdout.on('error',function(data) {
        console.log('Error', data.toString())
        publishLog(`error: ${data.toString()}`)
    })
  
    p.on('close', async function() {
        console.log('Build Complete')
        publishLog(`Build Complete`)


        publishLog(`Starting to upload`)
        const distFolderPath = path.join(__dirname,'output','dist')
        const distFolderContents = fs.readdirSync(distFolderPath,{recursive:true})

        for (const file of distFolderContents) {
            const filepath = path.join(distFolderPath, file)
            if(fs.lstatSync(filepath).isDirectory()) continue;

            console.log("Uploading",filepath)
            publishLog(`uploading ${file}`)
            const command = new PutObjectCommand({
                Bucket: 'deployer-client-files',
                Key: `__outputs/${PROJECT_ID}/${file}`,
                Body: fs.createReadStream(filepath),
                ContentType: mime.lookup(filepath)
            })

            await s3Client.send(command)
            publishLog(`uploaded ${file}`)
            console.log("Uploaded",filepath)
        }
        publishLog(`Done`)
        console.log('Done ...')
        process.exit(0) //to destroy the containers
    })
}

init()