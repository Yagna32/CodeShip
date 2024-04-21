const express = require('express')
const http_proxy = require('http-proxy')
const app = express()
const PORT = 8000

const BUCKET_PATH = `https://deployer-client-files.s3.ap-south-1.amazonaws.com/__outputs`

const proxy = http_proxy.createProxy()

app.use((req,res)=>{
    const hostname = req.hostname;
    const subdomain = hostname.split('.')[0];
    const resolvesTo = `${BUCKET_PATH}/${subdomain}`
    console.log(resolvesTo)
    return proxy.web(req,res,{target: resolvesTo, changeOrigin: true})
})

proxy.on('proxyReq', (proxyReq, req, res) => {
    const url = req.url;
    if (url === '/')
        proxyReq.path += 'index.html'

})

app.listen(PORT,()=>console.log("Server running on port : ",PORT))