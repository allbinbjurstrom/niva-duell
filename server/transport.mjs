import {WebSocketServer,WebSocket} from 'ws';
import {ShooterEngine} from './engine.mjs';
import {loadCatalog} from './catalog.mjs';
import {RULES} from '../shared/rules.mjs';
import {privateIPv4} from '../desktop/lan.cjs';

export function attachShooter(httpServer,{catalog=loadCatalog(),engine=new ShooterEngine(catalog)}={}){
  const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  const sockets=new Map(),rates=new Map();let closed=false;
  const send=(ws,data)=>{if(ws.readyState===WebSocket.OPEN&&ws.bufferedAmount<256_000)ws.send(JSON.stringify(data));};
  function upgrade(request,socket,head){
    const url=new URL(request.url,'http://local');if(url.pathname!=='/api/shooter/socket')return;
    if(wss.clients.size>=160||!sameOrigin(request)||!localRequest(request)){socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');socket.destroy();return;}
    wss.handleUpgrade(request,socket,head,ws=>wss.emit('connection',ws,request));
  }
  httpServer.on('upgrade',upgrade);
  wss.on('connection',ws=>{
    let player=null,windowStart=Date.now(),messages=0,alive=true;
    const timeout=setTimeout(()=>{if(!player)ws.close(1008,'Anslut till ett party först.');},5000);timeout.unref();
    ws.on('pong',()=>{alive=true;});ws.isAlive=()=>{const value=alive;alive=false;return value;};
    ws.on('error',()=>{});
    ws.on('message',raw=>{
      try{
        if(Date.now()-windowStart>1000){windowStart=Date.now();messages=0;}
        if(++messages>240){ws.close(1008,'För många kommandon.');return;}
        const message=JSON.parse(raw.toString());
        if(!player){
          if(message.type!=='auth'||typeof message.token!=='string')throw new Error('Anslut till partyt igen.');
          if(message.protocol!==RULES.protocolVersion){ws.close(1008,'Olika appversioner. Uppdatera båda till 0.2.3.');return;}
          player=engine.connect(message.token);clearTimeout(timeout);
          const previous=sockets.get(player.id);sockets.set(player.id,ws);previous?.close(4001,'Sessionen öppnades i en annan flik.');
          send(ws,engine.snapshot(player));return;
        }
        const response=engine.command(player,message);if(response)send(ws,response);
        if(message.type==='leave'){ws.close(1000);return;}
        if(message.type!=='input')send(ws,engine.snapshot(player));
      }catch(error){send(ws,{type:'error',message:error instanceof SyntaxError?'Ogiltigt meddelande.':error.message});if(!player)ws.close(1008,'Anslut till partyt igen.');}
    });
    ws.on('close',()=>{clearTimeout(timeout);if(player&&sockets.get(player.id)===ws){sockets.delete(player.id);engine.disconnect(player.id);}});
  });
  let previous=performance.now(),accumulator=0;
  const tick=setInterval(()=>{const now=performance.now();accumulator=Math.min(accumulator+(now-previous)/1000,.0625);previous=now;while(accumulator>=1/RULES.tickRate){engine.tick(1/RULES.tickRate);accumulator-=1/RULES.tickRate;}},4);
  const snapshots=setInterval(()=>{for(const [id,ws] of sockets){const p=engine.players.get(id);if(p&&!p.withdrawn)send(ws,engine.snapshot(p));}},1000/RULES.snapshotRate);
  const housekeeping=setInterval(()=>{
    for(const ws of wss.clients){if(!ws.isAlive()){ws.terminate();continue;}ws.ping();}
    engine.cleanup();for(const [key,rate] of rates)if(Date.now()>rate.until)rates.delete(key);
  },15_000);
  [tick,snapshots,housekeeping].forEach(timer=>timer.unref());
  async function middleware(request,response,next=()=>{response.statusCode=404;response.end();}){
    const url=new URL(request.url,'http://local');if(!url.pathname.startsWith('/api/shooter/'))return next();
    const json=(value,status=200)=>{response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value));};
    try{
      if(!localRequest(request))return json({error:'Den här matchservern tar bara emot anslutningar på lokala nätverk.'},403);
      if(request.method==='GET'&&url.pathname==='/api/shooter/config')return json({sections:catalog.sections,rules:RULES});
      if(request.method==='GET'&&url.pathname==='/api/shooter/health')return json({ok:true,mode:'niva-duell',protocol:RULES.protocolVersion,parties:engine.parties.size});
      const paper=url.pathname.match(/^\/api\/shooter\/papers\/([a-zA-Z0-9-]+)\.pdf$/);
      if(request.method==='GET'&&paper){
        const pdf=await catalog.pdf(paper[1]);response.writeHead(200,{'Content-Type':'application/pdf','Content-Length':pdf.length,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});response.end(pdf);return;
      }
      if(request.method==='POST'&&['/api/shooter/party','/api/shooter/join','/api/shooter/test','/api/shooter/demo'].includes(url.pathname)){
        if(!sameOrigin(request))return json({error:'Öppna spelet på samma adress som partyt.'},403);
        const key=request.socket.remoteAddress??'local',now=Date.now();let rate=rates.get(key);
        if(!rate||now>=rate.until){if(rates.size>=2048)rates.delete(rates.keys().next().value);rates.set(key,rate={count:0,until:now+60_000});}
        if(++rate.count>40)return json({error:'För många anslutningsförsök. Vänta en minut.'},429);
        let raw='';for await(const chunk of request){raw+=chunk;if(Buffer.byteLength(raw)>4096)return json({error:'För stort meddelande.'},413);}
        let body;try{body=JSON.parse(raw);}catch{return json({error:'Ogiltigt meddelande.'},400);}
        if(url.pathname.endsWith('/test'))return json(engine.createTest(body.name),201);
        if(url.pathname.endsWith('/demo'))return json(engine.createDemo(body.name),201);
        return json(url.pathname.endsWith('/party')?engine.create(body.name,body.section):engine.join(body.code,body.name),201);
      }
      return json({error:'Adressen finns inte.'},404);
    }catch(error){return json({error:error.message||'Servern kunde inte slutföra begäran.'},400);}
  }
  function close(){if(closed)return;closed=true;[tick,snapshots,housekeeping].forEach(clearInterval);httpServer.off('upgrade',upgrade);for(const ws of wss.clients)ws.terminate();wss.close();}
  return {middleware,close,engine};
}
function sameOrigin(request){
  if(!request.headers.origin)return true;
  try{return new URL(request.headers.origin).host===request.headers.host;}catch{return false;}
}
function localRequest(request){const ip=request.socket.remoteAddress??'';return ip==='::1'||privateIPv4(ip.replace(/^::ffff:/,''));}
