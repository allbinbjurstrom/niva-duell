import * as THREE from 'three';
import {sampleWeaponAnimation,WEAPON_ANIMATION,WEAPON_VIEW_LAYOUT,WEAPON_CONTACTS} from '../shared/weapon-animation.mjs';

export type WeaponViewState={time:number;dt:number;weaponId:string;ads:boolean;fireHeld:boolean;shotAt:number;recoilPitch:number;recoilYaw:number;reloadRemaining:number;reloadDuration:number;equipRemaining:number;equipDuration:number;speed:number;strafe:number;grounded:boolean;crouch:boolean;reducedMotion:boolean;visible:boolean;lookYawDelta?:number;lookPitchDelta?:number;stride?:number};
export type WeaponMechanicalEvent='mag-out'|'mag-in'|'bolt'|'equip';

const material=(color:string,metalness=.25)=>new THREE.MeshStandardMaterial({color,roughness:.68,metalness});
function cube(parent:THREE.Object3D,name:string,size:number[],at:number[],m:THREE.Material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size as [number,number,number]),m);mesh.name=name;mesh.position.set(...at as [number,number,number]);parent.add(mesh);return mesh;
}
function side(parent:THREE.Object3D,name:string,points:number[][],width:number,m:THREE.Material,holes:number[][][]=[]){
 const shape=new THREE.Shape();points.forEach(([z,y],i)=>i?shape.lineTo(z,y):shape.moveTo(z,y));shape.closePath();
 for(const points of holes){const hole=new THREE.Path();points.forEach(([z,y],i)=>i?hole.lineTo(z,y):hole.moveTo(z,y));hole.closePath();shape.holes.push(hole);}
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,steps:1});geometry.rotateY(-Math.PI/2);geometry.translate(width/2,0,0);
 const mesh=new THREE.Mesh(geometry,m);mesh.name=name;parent.add(mesh);return mesh;
}
function tube(parent:THREE.Object3D,name:string,radius:number,length:number,at:number[],m:THREE.Material,segments=8){
 const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,segments),m);mesh.name=name;mesh.rotation.x=Math.PI/2;mesh.position.set(...at as [number,number,number]);parent.add(mesh);return mesh;
}
function receiverBody(parent:THREE.Object3D,m:THREE.Material){
 // A slim, faceted cross-section leaves a narrow top spine instead of a box lid.
 const sections=[[-.43,.043,-.03,.102],[-.36,.051,-.043,.135],[-.10,.049,-.043,.145],[.125,.043,-.025,.11],[.16,.034,-.005,.065]];
 const vertices:number[]=[],indices:number[]=[];
 for(const [z,width,bottom,top] of sections){
  const bevel=Math.min(.027,(top-bottom)*.22);
  for(const [x,y] of [[-width*.64,top],[width*.64,top],[width,top-bevel],[width,bottom+bevel],[width*.65,bottom],[-width*.65,bottom],[-width,bottom+bevel],[-width,top-bevel]])vertices.push(x,y,z);
 }
 for(let i=0;i<sections.length-1;i++)for(let j=0;j<8;j++){const a=i*8+j,b=i*8+(j+1)%8,c=b+8,d=a+8;indices.push(a,c,b,a,d,c);}
 for(let i=1;i<7;i++){indices.push(0,i,i+1);const end=(sections.length-1)*8;indices.push(end,end+i+1,end+i);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 const mesh=new THREE.Mesh(geometry,m);mesh.name='receiver';parent.add(mesh);return mesh;
}
function frontSightLoop(parent:THREE.Object3D,m:THREE.Material){
 const shape=new THREE.Shape(),hole=new THREE.Path();
 for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4,x=Math.cos(a)*.021,y=Math.sin(a)*.024;i?shape.lineTo(x,y):shape.moveTo(x,y);}
 shape.closePath();
 for(let i=7;i>=0;i--){const a=Math.PI/8+i*Math.PI/4,x=Math.cos(a)*.015,y=Math.sin(a)*.017;i===7?hole.moveTo(x,y):hole.lineTo(x,y);}
 hole.closePath();shape.holes.push(hole);
 const geometry=new THREE.ExtrudeGeometry(shape,{depth:.014,bevelEnabled:false});geometry.translate(0,0,-.007);
 const mesh=new THREE.Mesh(geometry,m);mesh.name='front-sight-loop';mesh.position.set(0,WEAPON_VIEW_LAYOUT.sightY,WEAPON_VIEW_LAYOUT.sightZ);parent.add(mesh);
}
function contact(parent:THREE.Object3D,name:string,position:{x:number;y:number;z:number}){const anchor=new THREE.Object3D();anchor.name=name;anchor.position.set(position.x,position.y,position.z);parent.add(anchor);return anchor;}

/** Original low-poly construction; no extracted Riot mesh or texture is used. */
export function makeVandalModel(){
 const group=new THREE.Group();group.name='vandal-model';
 const receiver=material('#263039',.55),steel=material('#6c7477',.7),black=material('#111b23',.1),edge=material('#424e57',.4),recess=material('#09141b',.1);
 receiverBody(group,receiver);
 side(group,'receiver-cover',[[-.36,.135],[-.325,.145],[-.10,.154],[.12,.118],[.125,.11],[-.10,.145]],.064,edge);
 side(group,'stock',[[.12,.095],[.40,.06],[.45,-.01],[.46,-.18],[.40,-.20],[.32,-.075],[.12,-.05]],.082,black,[[[.205,.035],[.32,-.035],[.397,-.13],[.397,.012]]]);
 cube(group,'butt-pad',[.092,.23,.045],[0,-.075,.44],recess).rotation.x=-.12;
 cube(group,'stock-rib',[.09,.025,.24],[0,.035,.28],edge).rotation.x=.12;
 side(group,'pistol-grip',[[.065,-.055],[.145,-.07],[.115,-.275],[.025,-.25]],.075,black);
 for(let i=0;i<4;i++)cube(group,`grip-groove-${i}`,[.078,.009,.065],[0,-.135-i*.027,.079-i*.004],edge);
 const guard=new THREE.Shape();guard.moveTo(-.06,-.09);guard.lineTo(.025,-.09);guard.lineTo(.035,-.17);guard.lineTo(-.06,-.17);guard.lineTo(-.085,-.12);guard.closePath();
 const hole=new THREE.Path();hole.moveTo(-.05,-.105);hole.lineTo(-.066,-.123);hole.lineTo(-.047,-.15);hole.lineTo(.017,-.15);hole.lineTo(.01,-.105);hole.closePath();guard.holes.push(hole);
 const guardGeometry=new THREE.ExtrudeGeometry(guard,{depth:.035,bevelEnabled:false});guardGeometry.rotateY(-Math.PI/2);guardGeometry.translate(.0175,0,0);
 const triggerGuard=new THREE.Mesh(guardGeometry,edge);triggerGuard.name='trigger-guard';group.add(triggerGuard);
 cube(group,'trigger',[.018,.055,.018],[0,-.11,-.005],steel).rotation.x=-.25;
 side(group,'handguard',[[-.63,.045],[-.57,.115],[-.42,.105],[-.40,-.035],[-.59,-.035]],.105,black);
 for(let i=0;i<4;i++)cube(group,`handguard-rib-${i}`,[.112,.085,.018],[0,.02,-.44-i*.039],edge);
 tube(group,'barrel',.025,.38,[0,.072,-.795],steel);
 tube(group,'gas-tube',.017,.31,[0,.132,-.65],edge);
 cube(group,'gas-block',[.073,.105,.065],[0,.115,-.77],receiver);
 tube(group,'muzzle-brake',.033,.10,[0,.072,-1.00],receiver,6);
 for(const z of [-1.018,-.986])for(const x of [-1,1])cube(group,'muzzle-slot',[.004,.035,.017],[x*.031,.072,z],recess);
 const bore=new THREE.Mesh(new THREE.CircleGeometry(.018,8),new THREE.MeshBasicMaterial({color:'#050b10'}));bore.name='muzzle-bore';bore.rotation.y=Math.PI;bore.position.set(0,.072,-1.051);group.add(bore);
 cube(group,'front-sight-base',[.047,.018,.035],[0,.152,-.78],receiver);
 frontSightLoop(group,receiver);
 cube(group,'front-sight-post',[.005,.018,.010],[0,WEAPON_VIEW_LAYOUT.sightY-.015,-.78],steel);
 // A real central opening instead of a solid block across the sight line.
 cube(group,'rear-sight-base',[.049,.008,.031],[0,.137,.09],edge);
 for(const x of [-1,1])cube(group,'rear-sight-notch',[.008,.025,.025],[x*.020,.1545,.09],steel);
 cube(group,'ejection-port',[.005,.035,.105],[.050,.073,-.10],recess);
 const bolt=new THREE.Group();bolt.name='bolt';bolt.position.set(.067,.102,-.09);group.add(bolt);cube(bolt,'bolt-handle',[.046,.018,.033],[.015,0,0],steel);
 cube(group,'selector',[.007,.025,.045],[-.048,.015,.035],steel).rotation.x=-.3;
 cube(group,'receiver-side-panel',[.004,.032,.13],[-.050,.066,-.18],edge);
 const magazine=new THREE.Group();magazine.name='magazine';magazine.position.set(0,-.04,-.13);group.add(magazine);
 side(magazine,'curved-magazine',[[-.055,.015],[.075,.005],[.045,-.17],[-.035,-.35],[-.15,-.37],[-.10,-.19]],.078,edge);
 for(let i=0;i<4;i++){
  const rib=cube(magazine,'magazine-rib',[.083,.012,.11],[-.002,-.10-i*.055,-.003-i*.015],receiver);rib.rotation.x=-.15;
 }
 contact(magazine,'magazine-grip-contact',WEAPON_CONTACTS.magazine);
 contact(bolt,'bolt-grip-contact',WEAPON_CONTACTS.bolt);
 contact(group,'support-grip-contact',WEAPON_CONTACTS.support);
 const muzzle=new THREE.Object3D();muzzle.name='muzzle';muzzle.position.set(0,.072,-1.06);group.add(muzzle);
 const flash=new THREE.Group();flash.name='muzzle-flash';muzzle.add(flash);flash.visible=false;
 const flashMat=new THREE.MeshBasicMaterial({color:'#ffd88b',transparent:true,opacity:.92,depthWrite:false});
 for(let i=0;i<3;i++){const petal=new THREE.Mesh(new THREE.ConeGeometry(.045,.22,3),flashMat);petal.rotation.x=-Math.PI/2;petal.rotation.z=i*Math.PI*2/3;petal.position.z=-.075;petal.scale.x=.45;flash.add(petal);}
 return {group,magazine,bolt,muzzle,flash};
}

function hand(name:string,m:THREE.Material,right=false){
 const group=new THREE.Group();group.name=name;cube(group,'palm',[.082,.085,.11],[0,0,0],m);
 cube(group,'knuckles',[.085,.025,.085],[0,.039,-.018],m);
 cube(group,'thumb',[.042,.045,.075],[right?-.046:.046,.005,-.025],m).rotation.z=right?-.45:.45;
 for(let i=0;i<3;i++)cube(group,`finger-${i}`,[.087,.018,.025],[0,-.027+i*.022,-.058],m);
 if(!right){contact(group,'hand-magazine-contact',WEAPON_CONTACTS.handMagazine);contact(group,'hand-bolt-contact',WEAPON_CONTACTS.handBolt);contact(group,'hand-support-contact',WEAPON_CONTACTS.handSupport);}
 return group;
}
const up=new THREE.Vector3(0,1,0);
function placeArm(mesh:THREE.Mesh,from:THREE.Vector3,to:THREE.Vector3){const direction=to.clone().sub(from);mesh.position.copy(from).add(to).multiplyScalar(.5);mesh.scale.y=direction.length();mesh.quaternion.setFromUnitVectors(up,direction.normalize());}

export class WeaponView {
 group=new THREE.Group();rig=makeVandalModel();muzzle=this.rig.muzzle;
 private support=hand('support-hand',material('#172831',.05));
 private firingHand=hand('firing-hand',material('#172831',.05),true);
 private sleeveMaterial=material('#395d63',.05);
 private supportArm=new THREE.Mesh(new THREE.CylinderGeometry(.054,.071,1,6),this.sleeveMaterial);
 private firingArm=new THREE.Mesh(new THREE.CylinderGeometry(.05,.068,1,6),this.sleeveMaterial);
 private distance=0;private inspectAt=0;private weaponId='vandal';private reloadProgress=-1;private equipping=false;
 constructor(){
  this.group.name='vandal-first-person';this.group.visible=false;this.group.scale.setScalar(WEAPON_VIEW_LAYOUT.scale);this.group.add(this.rig.group,this.support,this.firingHand,this.supportArm,this.firingArm);
  this.firingHand.position.set(.055,-.135,.082);this.firingHand.rotation.set(.12,0,-.12);
  placeArm(this.firingArm,new THREE.Vector3(.24,-.36,.31),this.firingHand.position);
 }
 setWeapon(id:string){if(this.weaponId!==id){this.inspectAt=0;this.reloadProgress=-1;this.equipping=false;}this.weaponId=id;if(id!=='vandal')this.group.visible=false;}
 reset(){this.inspectAt=0;this.distance=0;this.reloadProgress=-1;this.equipping=false;this.rig.flash.visible=false;}
 inspect(time:number){if(this.weaponId==='vandal')this.inspectAt=time;}
 update(input:WeaponViewState):WeaponMechanicalEvent[]{
  this.setWeapon(input.weaponId);this.group.visible=input.visible&&input.weaponId==='vandal';
  const dt=Math.min(Math.max(Number.isFinite(input.dt)?input.dt:0,0),.1);
  if(input.grounded)this.distance+=Math.max(0,input.speed)*dt;
  if(input.ads||input.fireHeld||input.reloadRemaining>0||input.equipRemaining>0||input.time-input.shotAt<120)this.inspectAt=0;
  const stride=typeof input.stride==='number'&&Number.isFinite(input.stride)?input.stride:this.distance*Math.PI/1.8;
  const pose=sampleWeaponAnimation({...input,stride,inspectAt:this.inspectAt});
  this.group.position.set(pose.position.x,pose.position.y,pose.position.z);this.group.rotation.set(pose.rotation.x,pose.rotation.y,pose.rotation.z,'YXZ');
  this.support.position.set(pose.support.x,pose.support.y,pose.support.z);this.support.rotation.set(pose.supportRotation.x,pose.supportRotation.y,pose.supportRotation.z);
  placeArm(this.supportArm,new THREE.Vector3(-.31,-.38,.24),this.support.position);
  this.rig.magazine.position.set(pose.magazine.x,-.04+pose.magazine.y,-.13+pose.magazine.z);this.rig.magazine.rotation.set(pose.magazineRotation.x,pose.magazineRotation.y,pose.magazineRotation.z);this.rig.magazine.visible=pose.magazineVisible;
  this.rig.bolt.position.z=-.09+pose.bolt;this.rig.flash.visible=this.group.visible&&pose.flash;
  const events:WeaponMechanicalEvent[]=[];
  if(pose.reload>=0&&this.reloadProgress>=0)for(const [threshold,event] of [[WEAPON_ANIMATION.magOut,'mag-out'],[WEAPON_ANIMATION.magIn,'mag-in'],[WEAPON_ANIMATION.bolt,'bolt']] as const)if(this.reloadProgress<threshold&&pose.reload>=threshold)events.push(event);
  this.reloadProgress=pose.reload;
  if(pose.equip>=0&&!this.equipping)events.push('equip');this.equipping=pose.equip>=0;
  return events;
 }
 dispose(){const materials=new Set<THREE.Material>();this.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const list=Array.isArray(o.material)?o.material:[o.material];list.forEach(m=>materials.add(m));}});materials.forEach(m=>m.dispose());this.group.removeFromParent();}
}
