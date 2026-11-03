import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleVandalCurve,vandalSpreadDegrees,vandalRecoilDegrees,recoverVandalRecoil} from '../shared/vandal-profile.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('Vandal spread uses the extracted first-shot, burst and spray anchors',()=>{
  close(vandalSpreadDegrees(0),.25);close(vandalSpreadDegrees(1),.30);close(vandalSpreadDegrees(2),.35);
  close(vandalSpreadDegrees(1.5),.325);close(vandalSpreadDegrees(5),1);close(vandalSpreadDegrees(25),1);
});

test('Vandal ADS uses its additive transform and crouch retains its own multiplier',()=>{
  close(vandalSpreadDegrees(0,{ads:true}),.1575);close(vandalSpreadDegrees(25,{ads:true}),1.02);
  close(vandalSpreadDegrees(0,{crouch:true}),.2125);close(vandalSpreadDegrees(0,{ads:true,crouch:true}),.133875);
});

test('Vandal recoil climbs early then plateaus instead of accumulating to a large linear cap',()=>{
  close(vandalRecoilDegrees(1).pitch,.4);close(vandalRecoilDegrees(2).pitch,.9);close(vandalRecoilDegrees(7).pitch,7.6);
  for(let n=7;n<=25;n++){const p=vandalRecoilDegrees(n);assert.ok(p.pitch>7.4&&p.pitch<8.37);assert.ok(p.yaw>0&&p.yaw<2.12);}
  const normal=vandalRecoilDegrees(10),ads=vandalRecoilDegrees(10,{ads:true}),crouch=vandalRecoilDegrees(10,{crouch:true}),running=vandalRecoilDegrees(10,{running:true});
  close(ads.pitch,normal.pitch*.7);close(ads.yaw,normal.yaw*.7);close(crouch.pitch,normal.pitch*.85);close(running.pitch,normal.pitch*1.8);
});

test('normal automatic hip and ADS intervals do not start recovery and pauses fully reset',()=>{
  for(const idle of [1/9.75,1/8.775])assert.deepEqual(recoverVandalRecoil(.14,-.03,idle,1/128),{pitch:.14,yaw:-.03,recovered:false});
  assert.deepEqual(recoverVandalRecoil(.14,-.03,.375,1/128),{pitch:0,yaw:0,recovered:true});
});

test('the calibrated recovery reaches the same midway and final offsets at different tick rates',()=>{
  for(const rate of [30,60,128,240]){
    let pitch=.14,yaw=-.03,time=0;
    for(const end of [.25,.375]){
      while(time<end-1e-12){const step=Math.min(1/rate,end-time);time+=step;const p=recoverVandalRecoil(pitch,yaw,time,step);pitch=p.pitch;yaw=p.yaw;}
      close(pitch,end===.25?.07:0);close(yaw,end===.25?-.015:0);
    }
  }
});

test('profile sampling and recovery reject nonfinite numeric corruption',()=>{
  close(sampleVandalCurve('error',NaN),.25);assert.throws(()=>sampleVandalCurve('missing',0),RangeError);
  for(const n of [NaN,Infinity,-Infinity]){const r=vandalRecoilDegrees(n),p=recoverVandalRecoil(n,n,n,n);for(const value of [r.pitch,r.yaw,r.yawStep,p.pitch,p.yaw])assert.ok(Number.isFinite(value));}
});
