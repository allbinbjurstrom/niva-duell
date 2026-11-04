import {stanceDimensions,GAIT} from './movement.mjs';
import {hitAgent} from './agent-hit.mjs';
export const RULES=Object.freeze({protocolVersion:9,questions:5,baseCredits:800,correctCredits:900,maxPlayers:12,
  wins:3,buySeconds:45,roundSeconds:75,resultSeconds:4,waveSeconds:8,reconnectSeconds:30,
  tickRate:128,snapshotRate:64,radius:.32,height:1.8,crouchHeight:1.22,eye:1.62,crouchEye:1.03,gravity:18,jump:6.5,landPenalty:.225,tagSeconds:.35,tagSpeed:.275,walkSpeed:.6});
export const SECTIONS={XYZ:'Matematisk problemlösning',KVA:'Kvantitativa jämförelser',NOG:'Kvantitativa resonemang',DTK:'Diagram, tabeller och kartor',ORD:'Ordförståelse','LÄS':'Svensk läsförståelse',MEK:'Meningskomplettering',ELF:'Engelsk läsförståelse'};
const degrees=n=>n*Math.PI/180;
const handling={runSpeed:5.4,equip:1,adsRate:1,adsMove:.76,adsSpread:.7,deadzone:.275,walkError:3,runError:6,crouchError:.5,jumpError:7,recovery:.35,tapProtected:2,protectedShots:0,yawSwitch:.6,yawChance:.1,maxSpread:3,melee:false,burst:0,burstRate:2.22,burstSpread:1.1};
export const WEAPONS=Object.freeze({
  classic:{...handling,id:'classic',name:'Classic',category:'PISTOL',price:0,mag:12,reserve:36,rate:6.75,reload:1.75,auto:false,damage:[78,26,22],farDamage:[66,22,18],range:30,spread:degrees(.4),recoil:.011,zoom:1,runSpeed:5.7375,equip:.75,walkError:1.1,runError:2.3,burst:3,description:'Gratis startpistol. Högerklick skjuter tre kulor.'},
  ghost:{...handling,id:'ghost',name:'Ghost',category:'PISTOL',price:500,mag:13,reserve:26,rate:6.75,reload:1.5,auto:false,damage:[105,30,25],farDamage:[87,25,21],range:30,spread:degrees(.3),recoil:.009,zoom:1,runSpeed:5.7375,equip:.75,walkError:1.1,runError:2.3,description:'Lätt pistol med 13 skott. Belönar stillastående precision.'},
  sheriff:{...handling,id:'sheriff',name:'Sheriff',category:'PISTOL',price:800,mag:6,reserve:24,rate:4,reload:2.25,auto:false,damage:[159,55,46],farDamage:[145,50,42],range:30,spread:degrees(.25),recoil:.032,zoom:1,walkError:1.25,runError:3.5,recovery:.45,description:'Sex skott. Hög skada. Belönar precision.'},
  spectre:{...handling,id:'spectre',name:'Spectre',category:'KULSPRUTEPISTOL',price:1600,mag:30,reserve:90,rate:13.33,reload:2.25,auto:true,damage:[78,26,22],farDamage:[60,20,17],range:20,spread:degrees(.4),recoil:.009,zoom:1.15,runSpeed:5.7375,equip:.75,adsRate:.9,walkError:.8,runError:2.5,protectedShots:5,yawSwitch:.28,maxSpread:1.3,recovery:.3,description:'Snabb eldgivning. Mer förlåtande precision i rörelse.'},
  guardian:{...handling,id:'guardian',name:'Guardian',category:'GEVÄR',price:2250,mag:12,reserve:36,rate:5.25,reload:2.5,auto:false,damage:[195,65,49],farDamage:[195,65,49],range:50,spread:degrees(.1),recoil:.023,zoom:1.5,adsSpread:0,tapProtected:3,description:'Halvautomatisk precision. Oförändrad eldtakt när du siktar.'},
  phantom:{...handling,id:'phantom',name:'Phantom',category:'GEVÄR',price:2900,mag:30,reserve:60,rate:11,reload:2.5,auto:true,damage:[156,39,33],farDamage:[140,35,29],range:20,spread:degrees(.2),recoil:.012,zoom:1.25,adsRate:.9,protectedShots:8,description:'Stort magasin. 39 kroppsskada till 20 meter, sedan 35.'},
  vandal:{...handling,id:'vandal',name:'Vandal',category:'GEVÄR',price:2900,mag:25,reserve:50,rate:9.75,reload:2.5,auto:true,damage:[160,40,34],farDamage:[160,40,34],range:50,spread:degrees(.25),recoil:.015,zoom:1.25,adsRate:.9,protectedShots:6,crouchError:.8,recovery:.375,description:'Samma skada på alla avstånd. Kontrollerade skottsalvor.'},
  operator:{...handling,id:'operator',name:'Operator',category:'PRICKSKYTTE',price:4700,mag:5,reserve:10,rate:.6,reload:3.7,auto:false,damage:[255,150,120],farDamage:[255,150,120],range:80,spread:degrees(5),recoil:.07,zoom:2.5,runSpeed:5.13,equip:1.5,adsMove:.72,adsSpread:0,deadzone:.15,recovery:.6,description:'2,5× / 5× sikte. Stå stilla innan du skjuter.'},
  knife:{...handling,id:'knife',name:'Kniv',category:'NÄRSTRID',price:0,mag:0,reserve:0,rate:2,reload:0,auto:false,damage:[50,50,50],farDamage:[50,50,50],range:2.5,spread:0,recoil:0,zoom:1,runSpeed:6.75,equip:.75,melee:true,description:'3 tar fram kniven. Vänster slag, höger hugg.'}
});
export const ARMOR={none:{id:'none',name:'Ingen rustning',price:0,shield:0},light:{id:'light',name:'Lätt rustning',price:400,shield:25},heavy:{id:'heavy',name:'Tung rustning',price:1000,shield:50}};
export const MAP=Object.freeze({name:'SKÄRNING',width:48,depth:32,spawns:[{x:-19,z:0,yaw:-Math.PI/2},{x:19,z:0,yaw:Math.PI/2}],
  blocks:[
    {x:0,z:0,w:6,d:7,h:4.8,type:'tower'},
    {x:-9,z:-7,w:4,d:4,h:2.5,type:'crate'}, {x:9,z:7,w:4,d:4,h:2.5,type:'crate'},
    {x:-9,z:7,w:4,d:3,h:1.15,type:'cover'}, {x:9,z:-7,w:4,d:3,h:1.15,type:'cover'},
    {x:0,z:-12,w:7,d:1.5,h:2.4,type:'wall'}, {x:0,z:12,w:7,d:1.5,h:2.4,type:'wall'},
    {x:-17,z:-11,w:4,d:4,h:3.4,type:'building'}, {x:17,z:11,w:4,d:4,h:3.4,type:'building'},
    {x:-17,z:11,w:3,d:3,h:2.7,type:'building'}, {x:17,z:-11,w:3,d:3,h:2.7,type:'building'},
    {x:0,z:-16.5,w:50,d:1,h:7,type:'boundary'}, {x:0,z:16.5,w:50,d:1,h:7,type:'boundary'},
    {x:-24.5,z:0,w:1,d:34,h:7,type:'boundary'}, {x:24.5,z:0,w:1,d:34,h:7,type:'boundary'}
  ]});
export const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
export function budget(correct){return RULES.baseCredits+clamp(Math.trunc(correct),0,RULES.questions)*RULES.correctCredits;}
export function scheduleRoundRobin(ids){
  if(ids.length<2)return [];
  const ring=[...ids];if(ring.length%2)ring.push(null);
  const waves=[];
  for(let r=0;r<ring.length-1;r++){
    const pairs=[];let bye=null;
    for(let i=0;i<ring.length/2;i++){const a=ring[i],b=ring[ring.length-1-i];if(a&&b)pairs.push(r%2?[b,a]:[a,b]);else bye=a??b;}
    waves.push({pairs,bye});ring.splice(1,0,ring.pop());
  }
  return waves;
}
export function inputState(input){
  const number=(n,lo,hi)=>typeof n==='number'&&Number.isFinite(n)?clamp(n,lo,hi):0;
  return {seq:Math.trunc(number(input?.seq,0,Number.MAX_SAFE_INTEGER)),
    forward:number(input?.forward,-1,1),strafe:number(input?.strafe,-1,1),
    yaw:number(input?.yaw,-Math.PI*100,Math.PI*100),pitch:number(input?.pitch,-1.553343,1.553343),
    walk:input?.walk===true,crouch:input?.crouch===true,jump:input?.jump===true,
    fire:input?.fire===true,aim:input?.aim===true,altFire:input?.altFire===true,active:input?.active!==false,
    viewTime:number(input?.viewTime,0,Number.MAX_SAFE_INTEGER),triggerViewTime:number(input?.triggerViewTime,0,Number.MAX_SAFE_INTEGER),
    epoch:Math.trunc(number(input?.epoch,0,Number.MAX_SAFE_INTEGER)),viewFromId:Math.trunc(number(input?.viewFromId,0,Number.MAX_SAFE_INTEGER)),viewToId:Math.trunc(number(input?.viewToId,0,Number.MAX_SAFE_INTEGER)),triggerFromId:Math.trunc(number(input?.triggerFromId,0,Number.MAX_SAFE_INTEGER)),triggerToId:Math.trunc(number(input?.triggerToId,0,Number.MAX_SAFE_INTEGER)),
    ownSeq:Math.trunc(number(input?.ownSeq,0,Number.MAX_SAFE_INTEGER)),ownAlpha:number(input?.ownAlpha,0,1),triggerOwnSeq:Math.trunc(number(input?.triggerOwnSeq,0,Number.MAX_SAFE_INTEGER)),triggerOwnAlpha:number(input?.triggerOwnAlpha,0,1),
    triggerYaw:typeof input?.triggerYaw==='number'?number(input.triggerYaw,-Math.PI*100,Math.PI*100):number(input?.yaw,-Math.PI*100,Math.PI*100),triggerPitch:typeof input?.triggerPitch==='number'?number(input.triggerPitch,-1.553343,1.553343):number(input?.pitch,-1.553343,1.553343),
    triggerAim:typeof input?.triggerAim==='boolean'?input.triggerAim:input?.aim===true,triggerZoomLevel:input?.triggerZoomLevel===1||input?.triggerZoomLevel===2?input.triggerZoomLevel:input?.zoomLevel===2?2:1,
    firePress:Math.trunc(number(input?.firePress,0,Number.MAX_SAFE_INTEGER)),altPress:Math.trunc(number(input?.altPress,0,Number.MAX_SAFE_INTEGER)),zoomLevel:input?.zoomLevel===2?2:1};
}
export function makeBody(spawn){return {...spawn,y:0,vx:0,vz:0,vy:0,pitch:0,health:100,shield:0,crouch:false,walk:false,aim:false,grounded:true,jumpHeld:false,gaitPhase:0,landPenalty:0,tagged:false,seq:0};}
export function moveBody(body,input,dt,weapon=WEAPONS.classic){
  const startX=body.x,startZ=body.z;
  const speed=weapon.runSpeed*(input.crouch?.325:input.walk?RULES.walkSpeed:1)*(input.aim&&weapon.zoom>1?weapon.adsMove:1)*(body.tagged?RULES.tagSpeed:1);
  const length=Math.max(1,Math.hypot(input.forward,input.strafe));
  const tx=(-Math.sin(input.yaw)*input.forward+Math.cos(input.yaw)*input.strafe)/length*speed;
  const tz=(-Math.cos(input.yaw)*input.forward-Math.sin(input.yaw)*input.strafe)/length*speed;
  if(body.grounded){body.vx=tx;body.vz=tz;}
  else if(Math.hypot(tx,tz)>0){
    const wish=Math.hypot(tx,tz),nx=tx/wish,nz=tz/wish;
    const add=Math.min(Math.max(0,Math.min(1.5,wish)-body.vx*nx-body.vz*nz),18*dt);
    body.vx+=nx*add;body.vz+=nz*add;
    const current=Math.hypot(body.vx,body.vz);if(current>weapon.runSpeed){body.vx*=weapon.runSpeed/current;body.vz*=weapon.runSpeed/current;}
  }
  body.landPenalty=Math.max(0,(body.landPenalty??0)-dt);
  if(input.jump&&!body.jumpHeld&&body.grounded){body.vy=RULES.jump;body.grounded=false;}
  body.jumpHeld=input.jump;
  const oldY=body.y,nextY=body.y+body.vy*dt-RULES.gravity*dt*dt/2;body.vy-=RULES.gravity*dt;
  let floor=0;
  if(body.vy<=0)for(const block of MAP.blocks)if(oldY>=block.h-1e-6&&nextY<=block.h&&body.x+RULES.radius>block.x-block.w/2&&body.x-RULES.radius<block.x+block.w/2&&body.z+RULES.radius>block.z-block.d/2&&body.z-RULES.radius<block.z+block.d/2)floor=Math.max(floor,block.h);
  body.y=Math.max(floor,nextY);
  if(nextY<=floor){if(!body.grounded)body.landPenalty=RULES.landPenalty;body.vy=0;body.grounded=true;}else body.grounded=false;
  body.crouch=input.crouch;body.walk=input.walk;body.aim=input.aim;body.yaw=input.yaw;body.pitch=input.pitch;body.seq=input.seq;
  const blocked=(x,z)=>MAP.blocks.some(b=>body.y<b.h&&x+RULES.radius>b.x-b.w/2&&x-RULES.radius<b.x+b.w/2&&z+RULES.radius>b.z-b.d/2&&z-RULES.radius<b.z+b.d/2);
  const x=clamp(body.x+body.vx*dt,-24+RULES.radius,24-RULES.radius),z=clamp(body.z+body.vz*dt,-16+RULES.radius,16-RULES.radius);
  if(!blocked(x,body.z))body.x=x;else body.vx=0;
  if(!blocked(body.x,z))body.z=z;else body.vz=0;
  if(body.grounded)body.gaitPhase=(Number.isFinite(body.gaitPhase)?body.gaitPhase:0)+Math.hypot(body.x-startX,body.z-startZ)/GAIT.stepDistance*Math.PI;
  return body;
}
// Slab intersection, shared by authoritative bullets and sight checks.
export function rayBox(origin,direction,min,max){
  let near=0,far=200;
  for(let i=0;i<3;i++){
    if(Math.abs(direction[i])<1e-8){if(origin[i]<min[i]||origin[i]>max[i])return Infinity;continue;}
    const a=(min[i]-origin[i])/direction[i],b=(max[i]-origin[i])/direction[i];
    near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return Infinity;
  }
  return near;
}
export function wallDistance(origin,dir){const floor=dir[1]<-1e-8&&origin[1]>=0?-origin[1]/dir[1]:Infinity;return Math.min(120,floor,...MAP.blocks.map(b=>rayBox(origin,dir,[b.x-b.w/2,0,b.z-b.d/2],[b.x+b.w/2,b.h,b.z+b.d/2])));}
export function hitBody(origin,dir,body){return hitAgent(origin,dir,body,RULES);}
export function applyDamage(body,damage){
  const absorbed=Math.min(body.shield,damage*2/3);body.shield-=absorbed;body.health=Math.max(0,body.health-damage+absorbed);
  return body.health<=0;
}
