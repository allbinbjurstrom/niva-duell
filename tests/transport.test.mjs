import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {attachShooter} from '../server/transport.mjs';
import {privateIPv4} from '../desktop/lan.cjs';
import {RULES} from '../shared/rules.mjs';

const catalog={sections:[{id:'ORD',name:'Ordförståelse'}],choose:()=>[],pdf:async()=>Buffer.from('')};
async function server(t){
  const http=createServer((req,res)=>runtime.middleware(req,res)),runtime=attachShooter(http,{catalog});http.listen(0,'127.0.0.1');await once(http,'listening');
  t.after(async()=>{runtime.close();await new Promise(resolve=>http.close(resolve));});return {url:`http://127.0.0.1:${http.address().port}`,runtime};
}
const post=(url,path,data,origin)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(data)});
async function read(ws,predicate){
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{ws.off('message',listener);reject(new Error('WebSocket timeout'));},3000);const listener=data=>{const value=JSON.parse(data);if(predicate(value)){clearTimeout(timer);ws.off('message',listener);resolve(value);}};ws.on('message',listener);});
}
test('HTTP create/join and authenticated WebSocket share a real party',async t=>{
  const {url}=await server(t),created=await post(url,'/api/shooter/party',{name:'Albin',section:'ORD'});assert.equal(created.status,201);const a=await created.json();assert.match(a.code,/^[A-Z]{3}$/);
  const joined=await post(url,'/api/shooter/join',{name:'Lina',code:a.code.toLowerCase()});assert.equal(joined.status,201);const b=await joined.json();
  const wa=new WebSocket(url.replace('http','ws')+'/api/shooter/socket'),wb=new WebSocket(url.replace('http','ws')+'/api/shooter/socket');
  t.after(()=>{wa.terminate();wb.terminate();});await Promise.all([once(wa,'open'),once(wb,'open')]);
  const authA=read(wa,v=>v.type==='state'),authB=read(wb,v=>v.type==='state');wa.send(JSON.stringify({type:'auth',protocol:RULES.protocolVersion,token:a.token}));wb.send(JSON.stringify({type:'auth',protocol:RULES.protocolVersion,token:b.token}));
  const [sa,sb]=await Promise.all([authA,authB]);assert.equal(sa.party.code,sb.party.code);assert.equal(sa.party.members.length,2);assert.equal(sb.self.name,'Lina');assert.ok(!JSON.stringify(sb).includes(a.token));
  const err=read(wb,v=>v.type==='error');wb.send(JSON.stringify({type:'subject',section:'ORD'}));assert.match((await err).message,/värden/);
});
test('cross-origin writes, unknown parties, bad names and oversized requests are rejected',async t=>{
  const {url}=await server(t);assert.equal((await post(url,'/api/shooter/party',{name:'Albin'},'https://untrusted.example')).status,403);
  assert.equal((await post(url,'/api/shooter/join',{name:'Lina',code:'XYZ'})).status,400);
  assert.equal((await post(url,'/api/shooter/party',{name:'A',section:'ORD'})).status,400);
  assert.equal((await post(url,'/api/shooter/party',{name:'A'.repeat(5000)})).status,413);
});
test('solo HTTP and a single real WebSocket reach placeholder training without another client',async t=>{
  const {url}=await server(t);
  assert.equal((await post(url,'/api/shooter/test',{},'https://untrusted.example')).status,403);
  const response=await post(url,'/api/shooter/test',{});assert.equal(response.status,201);const credential=await response.json();
  assert.equal((await post(url,'/api/shooter/join',{name:'En vän',code:credential.code})).status,400);
  const ws=new WebSocket(url.replace('http','ws')+'/api/shooter/socket');t.after(()=>ws.terminate());await once(ws,'open');
  const authenticated=read(ws,v=>v.type==='state');ws.send(JSON.stringify({type:'auth',protocol:RULES.protocolVersion,token:credential.token}));
  const state=await authenticated;assert.equal(state.party.testMode,true);assert.equal(state.party.phase,'training');
  assert.equal(state.party.members.filter(p=>!p.bot).length,1);assert.equal(state.self.question.options.length,3);
  const graded=read(ws,v=>v.type==='state'&&v.self.feedback?.correct);ws.send(JSON.stringify({type:'answer',questionId:state.self.question.id,answer:'C'}));
  assert.equal((await graded).self.budget,1700);
});
test('only local IPv4 addresses can be opened by the native LAN bridge',()=>{
  for(const ip of ['192.168.1.20','10.0.0.2','172.16.0.8','172.31.20.1','169.254.2.1','127.0.0.1'])assert.equal(privateIPv4(ip),true);
  for(const ip of ['8.8.8.8','172.32.0.1','192.169.0.1','file:///etc/passwd','localhost','::1','192.168.1.999'])assert.equal(privateIPv4(ip),false);
});
test('the direct Vandal demo endpoint keeps origin protection and authenticates into the live arena',async t=>{
 const {url}=await server(t);assert.equal((await post(url,'/api/shooter/demo',{},'https://untrusted.example')).status,403);
 const response=await post(url,'/api/shooter/demo',{});assert.equal(response.status,201);const credential=await response.json();
 const ws=new WebSocket(url.replace('http','ws')+'/api/shooter/socket');t.after(()=>ws.terminate());await once(ws,'open');const auth=read(ws,v=>v.type==='state');ws.send(JSON.stringify({type:'auth',protocol:RULES.protocolVersion,token:credential.token}));const state=await auth;assert.equal(state.party.demoMode,'vandal');assert.equal(state.duel.phase,'live');assert.equal(state.self.activeWeapon,'vandal');assert.equal(state.self.ammo,25);assert.equal(state.self.question,null);
});

test('the live 128 Hz input stream stays connected and acknowledgement replay has no lost movement',async t=>{
  const {url,runtime}=await server(t),credential=await (await post(url,'/api/shooter/test',{})).json();
  const ws=new WebSocket(url.replace('http','ws')+'/api/shooter/socket');t.after(()=>ws.terminate());await once(ws,'open');
  const auth=read(ws,v=>v.type==='state');ws.send(JSON.stringify({type:'auth',protocol:RULES.protocolVersion,token:credential.token}));await auth;
  const p=runtime.engine.authenticate(credential.token),party=runtime.engine.partyOf(p);
  for(const q of party.questions){runtime.engine.command(p,{type:'answer',questionId:q.id,answer:'C'});runtime.engine.command(p,{type:'next'});}
  runtime.engine.command(p,{type:'buy',weapon:'vandal'});runtime.engine.command(p,{type:'ready'});party.duels[0].endsAt=Date.now()-1;
  await read(ws,v=>v.type==='state'&&v.duel?.phase==='live');const x=p.body.x,ack=read(ws,v=>v.type==='state'&&v.self.body?.seq>=128);
  let seq=0;const start=performance.now();
  await new Promise(resolve=>{const timer=setInterval(()=>{const due=Math.min(128,Math.floor((performance.now()-start)*128/1000));while(seq<due)ws.send(JSON.stringify({type:'input',seq:++seq,forward:1,yaw:-Math.PI/2}));if(seq===128){clearInterval(timer);resolve();}},4);t.after(()=>clearInterval(timer));});
  const moving=await ack;assert.equal(ws.readyState,WebSocket.OPEN);assert.ok(Math.abs(moving.self.body.x-x-5.4)<1e-6);
  const stopped=read(ws,v=>v.type==='state'&&v.self.body?.seq===129);ws.send(JSON.stringify({type:'input',seq:129,yaw:-Math.PI/2}));
  const state=await stopped;assert.equal(state.self.body.vx,0);assert.equal(state.self.body.x,moving.self.body.x);
});

test('older clients get an explicit version error instead of incompatible physics',async t=>{
  const {url}=await server(t),credential=await (await post(url,'/api/shooter/test',{})).json();
  const ws=new WebSocket(url.replace('http','ws')+'/api/shooter/socket');t.after(()=>ws.terminate());await once(ws,'open');
  const closed=once(ws,'close');ws.send(JSON.stringify({type:'auth',token:credential.token}));const [code,reason]=await closed;assert.equal(code,1008);assert.match(reason.toString(),/appversioner/);
});
