import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createControlStore} from '../desktop/preferences.cjs';
import {normalizeControls} from '../shared/controls.mjs';
test('native controls survive a new store instance and are independent of the host address',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'niva-controls-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'controls.json');
 const home=createControlStore(file,normalizeControls);assert.equal(home.read(),null);home.save({dpi:1600,sensitivity:.42,scopeSensitivity:.9});
 const anotherHost=createControlStore(file,normalizeControls);assert.equal(anotherHost.read().dpi,1600);assert.equal(anotherHost.read().sensitivity,.42);assert.equal(anotherHost.read().scopeSensitivity,.9);
 assert.equal(fs.existsSync(file+'.tmp'),false);
});
test('corrupt native preferences fall back and unknown fields are not persisted',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'niva-controls-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'controls.json'),store=createControlStore(file,normalizeControls);
 fs.writeFileSync(file,'{broken');assert.equal(store.read(),null);store.save({sensitivity:.5,path:'/outside',secret:'unused'});const saved=JSON.parse(fs.readFileSync(file));assert.equal(saved.controls.sensitivity,.5);assert.equal('path' in saved.controls,false);assert.equal('secret' in saved.controls,false);
});
test('reticle preferences preserve mouse values while bounding geometry and rejecting CSS text',()=>{
 const before={dpi:800,sensitivity:.55,adsSensitivity:1,scopeSensitivity:1};const v=normalizeControls({...before,crosshairColor:'#00ffff',crosshairLength:8,crosshairGap:0,crosshairThickness:3,crosshairDot:true});
 for(const [key,value] of Object.entries(before))assert.equal(v[key],value);assert.equal(v.crosshairColor,'#00ffff');assert.equal(v.crosshairGap,0);assert.equal(v.crosshairDot,true);
 const bad=normalizeControls({crosshairColor:'url(https://example.test/)',crosshairLength:Infinity,crosshairGap:-1,crosshairThickness:9,crosshairDot:'yes'});assert.equal(bad.crosshairColor,'#a5ffe0');assert.equal(bad.crosshairLength,4);assert.equal(bad.crosshairGap,4);assert.equal(bad.crosshairThickness,2);assert.equal(bad.crosshairDot,false);
});
