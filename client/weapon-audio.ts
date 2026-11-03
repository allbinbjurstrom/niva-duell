/** Original synthesized sound layers. No VALORANT recording or sample is used. */
const noiseBuffers=new WeakMap<AudioContext,AudioBuffer>();
function noiseBuffer(ctx:AudioContext){
 let buffer=noiseBuffers.get(ctx);if(buffer)return buffer;
 const samples=new Float32Array(Math.ceil(ctx.sampleRate*.25));let seed=0x6e697661;
 for(let i=0;i<samples.length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;samples[i]=((seed>>>0)/0x80000000-1)*Math.exp(-i/(ctx.sampleRate*.052));}
 buffer=ctx.createBuffer(1,samples.length,ctx.sampleRate);buffer.copyToChannel(samples,0);noiseBuffers.set(ctx,buffer);return buffer;
}
function noise(ctx:AudioContext,time:number,duration:number,volume:number,low:number,high:number,pan:number,destination:AudioNode){
 const source=ctx.createBufferSource();source.buffer=noiseBuffer(ctx);
 const hp=ctx.createBiquadFilter(),lp=ctx.createBiquadFilter(),envelope=ctx.createGain(),panner=ctx.createStereoPanner();hp.type='highpass';hp.frequency.value=low;lp.type='lowpass';lp.frequency.value=high;panner.pan.value=Math.max(-1,Math.min(1,pan));
 envelope.gain.setValueAtTime(.0001,time);envelope.gain.linearRampToValueAtTime(Math.max(.0001,volume),time+.001);envelope.gain.exponentialRampToValueAtTime(.0001,time+duration);
 source.connect(hp).connect(lp).connect(envelope).connect(panner).connect(destination);source.start(time);source.stop(time+duration+.01);
}
function tone(ctx:AudioContext,time:number,frequency:number,end:number,duration:number,volume:number,type:OscillatorType,destination:AudioNode){
 const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,time);osc.frequency.exponentialRampToValueAtTime(end,time+duration);
 gain.gain.setValueAtTime(Math.max(.0001,volume),time);gain.gain.exponentialRampToValueAtTime(.0001,time+duration);osc.connect(gain).connect(destination);osc.start(time);osc.stop(time+duration+.01);
}
export function playVandalShot(ctx:AudioContext,volume=.22,pan=0,destination:AudioNode=ctx.destination){
 if(ctx.state!=='running'||volume<=0)return;const t=ctx.currentTime;
 // A dry crack, low pressure pulse, and short metallic action have separate envelopes.
 noise(ctx,t,.12,volume*.78,850,6800,pan,destination);
 noise(ctx,t+.003,.18,volume*.25,130,2300,pan,destination);
 tone(ctx,t,110,42,.105,volume*.45,'triangle',destination);
 tone(ctx,t+.026,960,390,.055,volume*.065,'sine',destination);
}
export function playVandalMechanical(ctx:AudioContext,kind:'mag-out'|'mag-in'|'bolt'|'equip',volume=.09,destination:AudioNode=ctx.destination){
 if(ctx.state!=='running'||volume<=0)return;const t=ctx.currentTime;
 if(kind==='mag-out'){noise(ctx,t,.055,volume*.55,1400,7200,0,destination);tone(ctx,t+.012,330,150,.055,volume*.26,'triangle',destination);}
 else if(kind==='mag-in'){noise(ctx,t,.065,volume*.85,600,5600,0,destination);tone(ctx,t,190,80,.07,volume*.45,'triangle',destination);}
 else if(kind==='bolt'){noise(ctx,t,.08,volume*.8,1900,8800,0,destination);noise(ctx,t+.075,.04,volume*.65,900,6800,0,destination);tone(ctx,t+.075,690,250,.045,volume*.14,'square',destination);}
 else{noise(ctx,t,.055,volume*.45,1200,4800,0,destination);tone(ctx,t+.032,430,180,.045,volume*.17,'triangle',destination);}
}
