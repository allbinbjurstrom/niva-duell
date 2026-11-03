import * as THREE from 'three';
import {RULES} from '../shared/rules.mjs';
import {agentParts,agentPartsForBody} from '../shared/agent-pose.mjs';

type AgentBody={x:number;y:number;z:number;yaw:number;crouch:boolean;health?:number;grounded?:boolean;gaitPhase?:number;vx?:number;vz?:number};
type ViewOptions={phase?:number;visible?:boolean};

/** Original flat-color humanoid. Every body mesh uses an exact shared box. */
export function makePracticeAgent(rules=RULES){
  const group=new THREE.Group();group.name='practice-agent';
  const weaponAnchor=new THREE.Group();weaponAnchor.name='practice-agent-weapon-anchor';group.add(weaponAnchor);
  const geometries=new Map<string,THREE.BoxGeometry>(),materials=new Map<string,THREE.MeshStandardMaterial>();
  const textures:THREE.Texture[]=[];
  const material=(color:string)=>{
    let result=materials.get(color);
    if(!result){result=new THREE.MeshStandardMaterial({color,roughness:.9,metalness:.025});materials.set(color,result);}
    return result;
  };
  const geometry=(size:[number,number,number])=>{
    const key=size.join(',');let result=geometries.get(key);
    if(!result){result=new THREE.BoxGeometry(...size);geometries.set(key,result);}return result;
  };

  // Painted facets and a dark helmet edge suggest a bevel while keeping the
  // entire head box opaque and visible. No sphere hides the damage contour.
  const pixels=new Uint8Array(32*32*4);
  const swatches={face:[0xe6,0xb4,0x8f],light:[0xf2,0xc5,0x9e],shade:[0xc1,0x8d,0x6c],edge:[0x34,0x4b,0x50],ink:[0x26,0x3c,0x45]};
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    let color=swatches.face;
    if(x<2||x>29||y<7)color=swatches.edge;
    else if(x<4||y>29)color=swatches.shade;
    else if(x>27||y<9)color=swatches.light;
    if(y>=14&&y<=15&&(x>=8&&x<=11||x>=20&&x<=23))color=swatches.ink;
    if(x>=15&&x<=17&&y>=17&&y<=22)color=swatches.shade;
    if(y===26&&x>=12&&x<=20)color=swatches.shade;
    // DataTexture row zero is the bottom edge of its UV space.
    const offset=((31-y)*32+x)*4;
    pixels[offset]=color[0];pixels[offset+1]=color[1];pixels[offset+2]=color[2];pixels[offset+3]=255;
  }
  const faceMap=new THREE.DataTexture(pixels,32,32,THREE.RGBAFormat);faceMap.colorSpace=THREE.SRGBColorSpace;
  faceMap.magFilter=THREE.NearestFilter;faceMap.minFilter=THREE.LinearMipmapLinearFilter;faceMap.generateMipmaps=true;faceMap.needsUpdate=true;textures.push(faceMap);
  const face=new THREE.MeshStandardMaterial({map:faceMap,roughness:.95});materials.set('head-face-map',face);
  const headMaterials=[material('#b98b6b'),material('#c59a78'),material('#344b50'),material('#a8795d'),material('#344b50'),face];
  const meshes=new Map<string,THREE.Mesh>();
  for(const part of agentParts(false,rules)){
    const mesh=new THREE.Mesh(geometry(part.size),part.id==='head'?headMaterials:material(part.color));
    mesh.name=part.id;mesh.position.set(...part.position);mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.zone=part.zone;
    group.add(mesh);meshes.set(part.id,mesh);
  }
  let disposed=false;
  const pose=(body:AgentBody)=>{
    for(const part of agentPartsForBody(body,rules)){const mesh=meshes.get(part.id)!;mesh.geometry=geometry(part.size);mesh.position.set(...part.position);}
    weaponAnchor.position.set(.15,body.crouch?.56:1.14,-.31);
  };
  weaponAnchor.position.set(.15,1.14,-.31);
  return {group,weaponAnchor,update(body:AgentBody,options:ViewOptions={}){
    if(disposed)return;pose(body);
    group.position.set(body.x,body.y,body.z);group.rotation.set(0,body.yaw,0);group.scale.set(1,1,1);
    if(options.visible!==undefined)group.visible=options.visible;
    // options.phase never drives damageable geometry. Only the authoritative
    // body.gaitPhase used by hitAgent may move the shared body boxes.
  },dispose(){
    if(disposed)return;disposed=true;group.removeFromParent();group.clear();
    for(const value of geometries.values())value.dispose();
    for(const value of materials.values())value.dispose();
    for(const value of textures)value.dispose();
  }};
}
