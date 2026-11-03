// CI startup/transport check. Interactive keyboard/mouse QA is a separate test.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import {RULES} from '../shared/rules.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const executable=process.platform==='win32'?path.join(root,'release/win-unpacked/Niva Duell.exe'):path.join(root,`release/${process.arch==='arm64'?'mac-arm64':'mac'}/Niva Duell.app/Contents/MacOS/Niva Duell`);
const child=spawn(executable,['--disable-gpu'],{detached:true,stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.on('data',data=>{stderr+=data.toString();});
child.on('error',error=>{stderr+=error.message;});
const url='http://127.0.0.1:5205';let socket;
function stop(){
  socket?.terminate();
  // Electron helpers can retain inherited output pipes after the main process
  // receives SIGTERM. This process group belongs only to this CI launch.
  if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}
  child.stdout?.destroy();child.stderr?.destroy();child.unref();
}
const watchdog=setTimeout(()=>{stop();console.error('Packaged startup check exceeded 45 seconds.');process.exit(1);},45000);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function stateWhere(predicate){
  return new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>{socket.off('message',receive);reject(new Error('Packaged app state timed out.'));},5000);
    function receive(raw){const state=JSON.parse(raw);if(state.type==='error'){clearTimeout(timeout);socket.off('message',receive);reject(new Error(state.message));}else if(state.type==='state'&&predicate(state)){clearTimeout(timeout);socket.off('message',receive);resolve(state);}}
    socket.on('message',receive);
  });
}
try{
  let ready=false;
  for(let attempt=0;attempt<80;attempt++){
    if(child.exitCode!==null)throw new Error(`Packaged application exited: ${stderr}`);
    try{const r=await fetch(url+'/api/shooter/health',{signal:AbortSignal.timeout(500)});if(r.ok){const health=await r.json();assert.equal(health.mode,'niva-duell');assert.equal(health.protocol,RULES.protocolVersion);ready=true;break;}}catch{}
    await pause(250);
  }
  assert.ok(ready,`Packaged app did not start: ${stderr}`);
  const response=await fetch(url+'/api/shooter/demo',{method:'POST',headers:{'Content-Type':'application/json',Origin:url},body:JSON.stringify({name:'Release check'})});
  assert.equal(response.status,201);const credential=await response.json();
  socket=new WebSocket(url.replace('http','ws')+'/api/shooter/socket');
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  const initial=stateWhere(()=>true);socket.send(JSON.stringify({type:'auth',protocol:RULES.protocolVersion,token:credential.token}));
  const state=await initial;assert.equal(state.party.demoMode,'vandal');assert.equal(state.self.ammo,25);assert.equal(state.self.reserve,50);
  const walking=stateWhere(s=>s.self.body.walk&&Math.hypot(s.self.body.vx,s.self.body.vz)>0);
  socket.send(JSON.stringify({type:'input',seq:1,active:true,forward:1,strafe:0,walk:true,crouch:false,yaw:-Math.PI/2,pitch:0}));
  const walked=await walking;assert.ok(Math.abs(Math.hypot(walked.self.body.vx,walked.self.body.vz)-3.24)<1e-6);
  const crouching=stateWhere(s=>s.self.body.crouch);
  socket.send(JSON.stringify({type:'input',seq:2,active:true,forward:0,strafe:0,walk:false,crouch:true,yaw:-Math.PI/2,pitch:0}));
  await crouching;
  console.log('Packaged app startup, standalone catalog, Vandal demo, walk speed and crouch transport passed.');
}finally{
  clearTimeout(watchdog);stop();
}
