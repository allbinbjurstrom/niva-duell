import test from 'node:test';
import assert from 'node:assert/strict';
import {agentParts,agentPartsForBody} from '../shared/agent-pose.mjs';

const rules={height:1.8,crouchHeight:1.22,eye:1.62,crouchEye:1.03};
const moving=(extra={})=>({crouch:false,grounded:true,health:100,vx:5.4,vz:0,gaitPhase:Math.PI/2,...extra});

test('stopped, airborne, dead and legacy bodies use the exact neutral pose',()=>{
  for(const crouch of [false,true]){
    const neutral=agentParts(crouch,rules);
    for(const extra of [{vx:0,vz:0},{vx:.001,vz:.001},{grounded:false},{health:0},{gaitPhase:undefined},{gaitPhase:NaN},{vx:Infinity},{vz:undefined}]){
      assert.deepEqual(agentPartsForBody(moving({crouch,...extra}),rules),neutral);
    }
  }
  assert.deepEqual(agentPartsForBody(),agentParts(false));
});

test('opposite legs take turns stepping while the upper body and head stay fixed',()=>{
  for(const crouch of [false,true]){
    const neutral=agentParts(crouch,rules),a=agentPartsForBody(moving({crouch}),rules),b=agentPartsForBody(moving({crouch,gaitPhase:Math.PI*1.5}),rules);
    for(const part of neutral){
      const pa=a.find(p=>p.id===part.id),pb=b.find(p=>p.id===part.id);
      assert.deepEqual(pa.size,part.size);assert.deepEqual(pb.size,part.size);
      if(part.zone!==2){assert.deepEqual(pa,part);assert.deepEqual(pb,part);continue;}
      assert.equal(pa.position[0],part.position[0]);assert.equal(pb.position[0],part.position[0]);
      assert.ok(Math.abs((pa.position[2]-part.position[2])+(pb.position[2]-part.position[2]))<1e-12);
    }
    const left=a.find(p=>p.id==='left-boot'),right=a.find(p=>p.id==='right-boot');
    assert.ok(left.position[1]>right.position[1]);
    assert.ok(b.find(p=>p.id==='right-boot').position[1]>b.find(p=>p.id==='left-boot').position[1]);
  }
});

test('speed controls a bounded stride without penetrating the floor or closing the leg gap',()=>{
  for(const crouch of [false,true])for(let i=0;i<64;i++){
    const body=moving({crouch,gaitPhase:i*Math.PI/16}),neutral=agentParts(crouch,rules),parts=agentPartsForBody(body,rules);
    for(const part of parts){
      assert.ok(part.position[1]-part.size[1]/2>=-1e-12);
      if(part.zone!==2)continue;
      const base=neutral.find(p=>p.id===part.id);
      assert.ok(Math.abs(part.position[2]-base.position[2])<=.070000001);
      assert.ok(part.position[1]-base.position[1]<=.035000001);
      assert.ok(Math.abs(part.position[0])-part.size[0]/2>=.019999999);
    }
  }
  const stride=speed=>Math.abs(agentPartsForBody(moving({vx:speed}),rules).find(p=>p.id==='left-boot').position[2]+.04);
  assert.ok(stride(3.24)<stride(5.4));assert.equal(stride(5.4),stride(50));
});

test('pose generation is deterministic, periodic and does not mutate body or reusable neutral data',()=>{
  const body=Object.freeze(moving()),before=agentParts(false,rules),first=agentPartsForBody(body,rules);
  assert.deepEqual(agentPartsForBody(body,rules),first);assert.deepEqual(agentParts(false,rules),before);
  const period=agentPartsForBody({...body,gaitPhase:body.gaitPhase+Math.PI*2},rules);
  for(let i=0;i<first.length;i++)for(let axis=0;axis<3;axis++)assert.ok(Math.abs(first[i].position[axis]-period[i].position[axis])<1e-12);
  first[0].position[0]=999;assert.deepEqual(agentParts(false,rules),before);
});
