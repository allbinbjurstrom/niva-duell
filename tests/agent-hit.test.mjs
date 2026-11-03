import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {agentParts,agentPartsForBody} from '../shared/agent-pose.mjs';
import {hitAgent} from '../shared/agent-hit.mjs';

// Our prototype dimensions, not a measurement of Riot's character hitboxes.
const rules={height:1.8,crouchHeight:1.22,eye:1.62,crouchEye:1.03};
const bodyFor=(extra={})=>({x:0,y:0,z:0,yaw:0,crouch:false,gaitPhase:0,vx:0,vz:0,grounded:true,...extra});
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const headFor=crouch=>agentParts(crouch,rules).find(part=>part.zone===0);
const yaws=[-Math.PI,-2.13,-Math.PI/2,-.17,0,.39,Math.PI/2,2.77,Math.PI];
const motionCases=[
  {gaitPhase:0,vx:5.4,vz:0,grounded:true},
  {gaitPhase:Math.PI/2,vx:5.4,vz:0,grounded:true},
  {gaitPhase:Math.PI,vx:0,vz:3.24,grounded:true},
  {gaitPhase:Math.PI*1.5,vx:-3.24,vz:0,grounded:true},
  {gaitPhase:1.1,vx:1.24,vz:1.24,grounded:true},
  {gaitPhase:1.1,vx:0,vz:0,grounded:true},
  {gaitPhase:1.1,vx:5.4,vz:0,grounded:false},
  {gaitPhase:NaN,vx:5.4,vz:0,grounded:true},
  {gaitPhase:undefined,vx:undefined,vz:undefined,grounded:undefined}
];

function transform(body){
  return new THREE.Matrix4().makeRotationY(body.yaw).setPosition(body.x,body.y,body.z);
}

function localRay(origin,direction,body){
  const matrix=transform(body);
  return {origin:new THREE.Vector3(...origin).applyMatrix4(matrix).toArray(),
    direction:new THREE.Vector3(...direction).transformDirection(matrix).toArray()};
}

function visibleMeshes(body){
  const group=new THREE.Group();group.position.set(body.x,body.y,body.z);group.rotation.y=body.yaw;
  const meshes=agentPartsForBody(body,rules).map(part=>{
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(...part.size),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
    mesh.position.set(...part.position);mesh.userData.zone=part.zone;group.add(mesh);return mesh;
  });
  group.updateMatrixWorld(true);
  return {meshes,dispose(){for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}}};
}

function matchesVisibleSurface(hit,intersections,context=''){
  const first=intersections[0];
  if(!first){assert.equal(hit.distance,Infinity,context);return false;}
  close(hit.distance,first.distance,2e-7);
  // BoxGeometry stores Float32 vertices. At a shared hip/leg boundary, two
  // mathematically equal faces can differ by nanometres. Accept either visible
  // zone only within the same 0.2-micrometre first-surface distance tolerance.
  const firstZones=intersections.filter(item=>item.distance-first.distance<=2e-7).map(item=>item.object.userData.zone);
  assert.ok(firstZones.includes(hit.zone),`${context}: zone ${hit.zone} is not on the first visible surface (${firstZones})`);
  return true;
}

test('the visible head edge is the headshot edge from every yaw, stance and gait',()=>{
  for(const motion of motionCases)for(const crouch of [false,true])for(const yaw of yaws){
    const body=bodyFor({...motion,x:3.7,y:2.1,z:-4.3,yaw,crouch}),head=headFor(crouch),[hx,hy,hz]=head.position;
    const posedHead=agentPartsForBody(body,rules).find(part=>part.zone===0);
    assert.deepEqual(posedHead.position,head.position);assert.deepEqual(posedHead.size,head.size);
    close(head.size[0],.36);close(head.size[1],.36);close(head.size[2],.32);
    // Reproduce the old invisible headshot region at 19/23/25.9 cm.
    for(const sign of [-1,1])for(const x of [.19,.23,.259]){
      const ray=localRay([hx+sign*x,hy,hz+5],[0,0,-1],body);
      assert.equal(hitAgent(ray.origin,ray.direction,body,rules).distance,Infinity,`invisible head edge x=${sign*x}, yaw=${yaw}, crouch=${crouch}`);
    }
    for(const sign of [-1,1]){
      const inside=localRay([hx+sign*(head.size[0]/2-1e-6),hy,hz+5],[0,0,-1],body);
      const hit=hitAgent(inside.origin,inside.direction,body,rules);assert.equal(hit.zone,0);close(hit.distance,5-head.size[2]/2);
      const outside=localRay([hx+sign*(head.size[0]/2+1e-6),hy,hz+5],[0,0,-1],body);
      assert.equal(hitAgent(outside.origin,outside.direction,body,rules).distance,Infinity);
      // Side views must honor the narrower 32 cm head depth as well.
      const side=localRay([hx+5,hy,hz+sign*(head.size[2]/2+1e-6)],[-1,0,0],body);
      assert.equal(hitAgent(side.origin,side.direction,body,rules).distance,Infinity);
    }
    const above=localRay([hx,hy+head.size[1]/2+1e-6,hz+5],[0,0,-1],body);
    assert.equal(hitAgent(above.origin,above.direction,body,rules).distance,Infinity);
  }
});

test('moving visible parts report their damage zone; the gap between legs stays empty',()=>{
  for(const motion of motionCases)for(const crouch of [false,true])for(const yaw of yaws){
    const body=bodyFor({...motion,yaw,crouch});
    for(const part of agentPartsForBody(body,rules)){
      // A crouched hip legitimately occludes the front of a thigh. A visible
      // surface from another side must still report the leg's actual zone.
      const hits=[];
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
        const origin=[...part.position],direction=[0,0,0];origin[axis]+=sign*5;direction[axis]=-sign;
        const ray=localRay(origin,direction,body);hits.push(hitAgent(ray.origin,ray.direction,body,rules));
      }
      assert.ok(hits.some(hit=>Number.isFinite(hit.distance)&&hit.zone===part.zone),`${part.id} must expose a surface with its damage zone`);
    }
    for(const y of [.05,.15,.20]){
      const gap=localRay([0,y,5],[0,0,-1],body);
      assert.equal(hitAgent(gap.origin,gap.direction,body,rules).distance,Infinity,`gap y=${y}, yaw=${yaw}, crouch=${crouch}`);
    }
  }
});

test('nearest surface wins even when the ray also reaches a different damage zone',()=>{
  for(const crouch of [false,true]){
    const body=bodyFor({x:2,y:3,z:4,yaw:.71,crouch}),head=headFor(crouch);
    const down=localRay([head.position[0],5,head.position[2]],[0,-1,0],body);
    const upper=hitAgent(down.origin,down.direction,body,rules);assert.equal(upper.zone,0);
    close(upper.distance,5-head.position[1]-head.size[1]/2);
    const up=localRay([0,-2,0],[0,1,0],body),lower=hitAgent(up.origin,up.direction,body,rules);
    assert.equal(lower.zone,1,'central leg gap exposes the first actual torso/hip box, not an invisible leg slab');
    const firstVisible=agentParts(crouch,rules).filter(part=>Math.abs(part.position[0])<=part.size[0]/2&&Math.abs(part.position[2])<=part.size[2]/2)
      .reduce((min,part)=>Math.min(min,part.position[1]-part.size[1]/2),Infinity);
    close(lower.distance,2+firstVisible);
  }
});

test('translated and yaw-rotated hit distances match independent Three.js triangle raycasts',()=>{
  let checked=0,misses=0,hits=0;
  for(const crouch of [false,true])for(const yaw of yaws){
    const body=bodyFor({x:3.17,y:1.9,z:-7.23,yaw,crouch}),visible=visibleMeshes(body),head=headFor(crouch);
    const targets=[head.position,[0,.75,0],[-.15,.15,0],[0,.15,0],[.23,head.position[1],0],[0,2.1,0]];
    try{
      for(let i=0;i<16;i++)for(const elevation of [-.6,.6,2.4,4])for(const target of targets){
        const originLocal=[Math.sin(i*Math.PI/8+.071)*5,elevation,Math.cos(i*Math.PI/8+.071)*5];
        const localDirection=new THREE.Vector3(...target).sub(new THREE.Vector3(...originLocal)).normalize().toArray();
        const ray=localRay(originLocal,localDirection,body),hit=hitAgent(ray.origin,ray.direction,body,rules);
        const expected=new THREE.Raycaster(new THREE.Vector3(...ray.origin),new THREE.Vector3(...ray.direction)).intersectObjects(visible.meshes,false);
        if(matchesVisibleSurface(hit,expected))hits++;else misses++;
        checked++;
      }
    }finally{visible.dispose();}
  }
  assert.equal(checked,6912);assert.ok(hits>0);assert.ok(misses>0);
});

test('moving and airborne poses match the actually rendered triangles across gait phases and speeds',()=>{
  let checked=0;
  for(const motion of motionCases)for(const crouch of [false,true])for(const yaw of [-2.13,0,Math.PI/2]){
    const body=bodyFor({...motion,x:-3.8,y:2.6,z:5.1,yaw,crouch}),visible=visibleMeshes(body),head=headFor(crouch);
    const targets=[head.position,[0,.75,0],[-.115,.20,0],[.115,.065,-.15],[0,.15,0],[.23,head.position[1],0]];
    try{
      for(let i=0;i<8;i++)for(const elevation of [-.6,.8,3])for(const target of targets){
        const originLocal=[Math.sin(i*Math.PI/4+.071)*5,elevation,Math.cos(i*Math.PI/4+.071)*5];
        const direction=new THREE.Vector3(...target).sub(new THREE.Vector3(...originLocal)).normalize().toArray();
        const ray=localRay(originLocal,direction,body),hit=hitAgent(ray.origin,ray.direction,body,rules);
        const expected=new THREE.Raycaster(new THREE.Vector3(...ray.origin),new THREE.Vector3(...ray.direction)).intersectObjects(visible.meshes,false);
        matchesVisibleSurface(hit,expected,JSON.stringify({motion,crouch,yaw,i,elevation,target}));
        checked++;
      }
    }finally{visible.dispose();}
  }
  assert.equal(checked,7776);
});

test('leg ray distances move with visible gait, while idle and airborne poses remain neutral',()=>{
  for(const crouch of [false,true]){
    const body=bodyFor({crouch,yaw:.61}),ray=localRay([-.115,.20,5],[0,0,-1],body);
    const neutral=hitAgent(ray.origin,ray.direction,body,rules);assert.equal(neutral.zone,2);
    let changed=false;
    for(const gaitPhase of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
      const moving=hitAgent(ray.origin,ray.direction,{...body,gaitPhase,vx:5.4},rules);
      assert.equal(moving.zone,2);
      if(Math.abs(moving.distance-neutral.distance)>1e-5)changed=true;
      for(const inactive of [{gaitPhase,vx:0,vz:0,grounded:true},{gaitPhase,vx:5.4,vz:0,grounded:false}]){
        const hit=hitAgent(ray.origin,ray.direction,{...body,...inactive},rules);
        close(hit.distance,neutral.distance);assert.equal(hit.zone,neutral.zone);
      }
    }
    assert.ok(changed,'the authoritative leg surface must follow the shared visible gait pose');
  }
});

test('a complete 3D ray keeps metre distances, including steep pitch',()=>{
  for(const yaw of yaws){
    const body=bodyFor({x:-8,y:4,z:11,yaw}),head=headFor(false);
    const origin=[head.position[0],head.position[1]+4,head.position[2]+3],direction=[0,-.8,-.6];
    const ray=localRay(origin,direction,body),hit=hitAgent(ray.origin,ray.direction,body,rules);
    assert.equal(hit.zone,0);close(Math.hypot(...ray.direction),1);
    // First touch is the head's top: (4 - half-height) / .8 metres.
    close(hit.distance,(4-head.size[1]/2)/.8);
  }
});

test('inside, behind and invalid rays stay finite or miss without mutating the pose',()=>{
  const body=bodyFor({x:1,y:2,z:3,yaw:.51,crouch:true}),before={...body},head=headFor(true);
  const inside=localRay(head.position,[0,0,-1],body),hit=hitAgent(inside.origin,inside.direction,body,rules);
  assert.equal(hit.distance,0);assert.equal(hit.zone,0);assert.deepEqual(body,before);
  const away=localRay([0,head.position[1],5],[0,0,1],body);
  assert.equal(hitAgent(away.origin,away.direction,body,rules).distance,Infinity);
  for(const direction of [[0,0,0],[NaN,0,-1],[0,Infinity,-1]])assert.equal(hitAgent([0,1,5],direction,body,rules).distance,Infinity);
  assert.equal(hitAgent([NaN,1,5],[0,0,-1],body,rules).distance,Infinity);
  assert.equal(hitAgent([0,1,5],[0,0,-1],null,rules).distance,Infinity);
});
