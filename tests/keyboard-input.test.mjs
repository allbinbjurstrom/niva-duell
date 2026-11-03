import test from 'node:test';
import assert from 'node:assert/strict';
import {createKeyboardInput} from '../shared/keyboard-input.mjs';
import {RULES,WEAPONS,makeBody,moveBody,inputState} from '../shared/rules.mjs';
import {stanceDimensions} from '../shared/movement.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function move(keys,ticks=1){
  const body=makeBody({x:-4,z:-9,yaw:-Math.PI/2});
  for(let i=0;i<ticks;i++)moveBody(body,inputState({...keys.read(),yaw:-Math.PI/2}),1/RULES.tickRate,WEAPONS.vandal);
  return body;
}

test('Shift already held before locking the mouse walks 3.24 m instead of running 5.4 m',()=>{
  const keys=createKeyboardInput();
  keys.keyDown({code:'KeyW',shiftKey:true,ctrlKey:false});
  const body=move(keys,128);close(body.x+4,3.24);assert.equal(body.walk,true);
  keys.keyUp({code:'ShiftLeft',shiftKey:false,ctrlKey:false});
  const run=move(keys,128);close(run.x+4,5.4);assert.equal(run.walk,false);
});

test('Ctrl in a pointer event activates actual crouch height, eye and movement speed',()=>{
  const keys=createKeyboardInput();keys.syncModifiers({ctrlKey:true,shiftKey:false});
  keys.keyDown({code:'KeyW',ctrlKey:true,shiftKey:false});
  const body=move(keys,128);assert.equal(body.crouch,true);
  close(body.x+4,1.755);close(stanceDimensions(body.crouch,RULES).eye,RULES.crouchEye);
  keys.syncModifiers({ctrlKey:false,shiftKey:false});
  assert.equal(move(keys).crouch,false);close(stanceDimensions(move(keys).crouch,RULES).eye,RULES.eye);
});

test('a subsequent pointer sample clears a missed modifier release without releasing W',()=>{
  const keys=createKeyboardInput();keys.keyDown({code:'ShiftLeft',shiftKey:true});keys.keyDown({code:'KeyW',shiftKey:true});
  keys.syncModifiers({shiftKey:false,ctrlKey:false});
  const body=move(keys);assert.equal(body.walk,false);close(body.vx,5.4);
});

test('releasing either side keeps walking until the last physically held Shift is released',()=>{
  const keys=createKeyboardInput();
  keys.keyDown({code:'ShiftLeft',shiftKey:true});keys.keyDown({code:'ShiftRight',shiftKey:true});
  keys.keyUp({code:'ShiftLeft',shiftKey:true});assert.equal(keys.read().walk,true);
  keys.keyUp({code:'ShiftRight',shiftKey:false});assert.equal(keys.read().walk,false);
  keys.keyDown({code:'ControlLeft'});keys.keyDown({code:'ControlRight'});
  keys.keyUp({code:'ControlLeft'});assert.equal(keys.read().crouch,true);
  keys.keyUp({code:'ControlRight'});assert.equal(keys.read().crouch,false);
});

test('physical WASD codes remain authoritative across keyboard layouts',()=>{
  const keys=createKeyboardInput();keys.keyDown({code:'KeyW',key:'z',shiftKey:false,ctrlKey:false});
  assert.equal(keys.read().forward,1);
  keys.keyDown({code:'KeyS',key:'s'});assert.equal(keys.read().forward,0);
  keys.keyUp({code:'KeyS'});assert.equal(keys.read().forward,1);
});

test('modifier key names work when a platform omits code, and reset clears all held input',()=>{
  const keys=createKeyboardInput();keys.keyDown({key:'Shift'});keys.keyDown({key:'Control'});keys.keyDown({code:'KeyW'});keys.keyDown({code:'Space'});
  assert.deepEqual(keys.read(),{forward:1,strafe:0,jump:true,walk:true,crouch:true});
  keys.reset();assert.deepEqual(keys.read(),{forward:0,strafe:0,jump:false,walk:false,crouch:false});
  keys.syncModifiers({shiftKey:true,ctrlKey:false});assert.equal(keys.read().forward,0);assert.equal(keys.read().walk,true);
});
