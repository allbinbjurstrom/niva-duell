import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {networkInterfaces} from 'node:os';
import {attachShooter} from './transport.mjs';

const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.mjs':'text/javascript'};
export function createShooterServer(options={}){
let runtime;
const server=createServer((request,response)=>runtime.middleware(request,response,async()=>{
  try{
    const pathname=decodeURIComponent(new URL(request.url,'http://local').pathname);
    const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep)&&file!==path.join(root,'index.html')){response.writeHead(404);response.end();return;}
    if(!(await stat(file)).isFile())throw new Error('not-found');
    const data=await readFile(file);response.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':pathname.startsWith('/assets/')?'public,max-age=31536000,immutable':'no-cache'});response.end(data);
  }catch{response.writeHead(404);response.end('Sidan finns inte. Kör npm run build före npm start.');}
}));
runtime=attachShooter(server,options);
return {server,runtime};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
const {server,runtime}=createShooterServer();
const port=Number(process.env.PORT??5205);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Ogiltig port.');
server.listen(port,process.env.HOST??'0.0.0.0',()=>{
  console.log(`Nivå Duell: http://localhost:${port}/`);
  for(const network of Object.values(networkInterfaces()).flat())if(network?.family==='IPv4'&&!network.internal)console.log(`Samma nätverk: http://${network.address}:${port}/`);
});
function stop(){runtime.close();server.close();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
