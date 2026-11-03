/**
 * @typedef {{code?:string,key?:string,shiftKey?:boolean,ctrlKey?:boolean}} KeySample
 */
const fallbackCode=key=>({Shift:'ShiftLeft',Control:'ControlLeft',' ':'Space',Tab:'Tab'}[key]??(/^[wasd]$/i.test(key??'')?`Key${key.toUpperCase()}`:''));
const isShift=code=>code==='ShiftLeft'||code==='ShiftRight';
const isControl=code=>code==='ControlLeft'||code==='ControlRight';

// A modifier can already be held when pointer lock starts, or its key event can
// be missed on a focus transition. Mouse/keyboard flags resynchronise it without
// changing the physical WASD layout or adding any movement smoothing.
export function createKeyboardInput(){
  const codes=new Set();
  let shift=false,control=false;
  /** @param {KeySample} event */
  function syncModifiers(event){
    if(typeof event.shiftKey==='boolean')shift=event.shiftKey;
    if(typeof event.ctrlKey==='boolean')control=event.ctrlKey;
  }
  /** @param {KeySample} event */
  function keyDown(event){
    syncModifiers(event);
    const code=event.code||fallbackCode(event.key);
    if(code)codes.add(code);
    if(isShift(code))shift=true;
    if(isControl(code))control=true;
  }
  /** @param {KeySample} event */
  function keyUp(event){
    const code=event.code||fallbackCode(event.key);
    codes.delete(code);syncModifiers(event);
    if(isShift(code)&&typeof event.shiftKey!=='boolean')shift=codes.has('ShiftLeft')||codes.has('ShiftRight');
    if(isControl(code)&&typeof event.ctrlKey!=='boolean')control=codes.has('ControlLeft')||codes.has('ControlRight');
  }
  return {
    syncModifiers,keyDown,keyUp,
    read:()=>({forward:(codes.has('KeyW')?1:0)-(codes.has('KeyS')?1:0),strafe:(codes.has('KeyD')?1:0)-(codes.has('KeyA')?1:0),jump:codes.has('Space'),walk:shift,crouch:control}),
    reset(){codes.clear();shift=false;control=false;}
  };
}
