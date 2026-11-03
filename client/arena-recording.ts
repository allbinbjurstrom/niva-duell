export type ArenaRecordingStatus='idle'|'recording'|'stopping';
export type ArenaRecording={blob:Blob;url:string;filename:string};
export type ArenaRecorderOptions={
  onStatus?:(status:ArenaRecordingStatus)=>void;
  onReady?:(recording:ArenaRecording)=>void;
  onError?:(error:Error)=>void;
  /** Optional game audio owned by the caller; its tracks are never stopped here. */
  audioStream?:MediaStream;
};
export type ArenaRecorder={start:()=>boolean;stop:()=>void;dispose:()=>void};

type Session={
  recorder:MediaRecorder;
  videoTracks:MediaStreamTrack[];
  chunks:Blob[];
  startedAt:Date;
  timer:ReturnType<typeof setTimeout>|null;
};

/**
 * Records actual frames rendered into this canvas, with optional supplied game
 * audio. No desktop capture, microphone access, network or permission request.
 * 60 fps is the capture target, not a guarantee of delivered frame rate.
 * https://www.w3.org/TR/mediacapture-fromelement/
 * https://www.w3.org/TR/mediastream-recording/
 */
export function createArenaRecorder(canvas:HTMLCanvasElement,options:ArenaRecorderOptions={}):ArenaRecorder{
  let session:Session|null=null,ownedUrl:string|null=null,disposed=false;

  function revokeUrl(){
    if(ownedUrl){URL.revokeObjectURL(ownedUrl);ownedUrl=null;}
  }

  function clearTimer(current:Session){
    if(current.timer!==null){clearTimeout(current.timer);current.timer=null;}
  }

  function detach(current:Session){
    clearTimer(current);
    current.recorder.ondataavailable=null;current.recorder.onstop=null;current.recorder.onerror=null;
  }

  function stopVideos(tracks:MediaStreamTrack[]){
    for(const track of tracks)track.stop();
  }

  function report(message:string,cause?:unknown){
    if(!disposed)options.onError?.(new Error(message,{cause}));
  }

  function fail(current:Session,cause:unknown){
    if(session!==current)return;
    session=null;detach(current);
    try{if(current.recorder.state!=='inactive')current.recorder.stop();}catch{}
    stopVideos(current.videoTracks);current.chunks=[];
    if(!disposed){options.onStatus?.('idle');report('Inspelningen kunde inte slutföras. Försök igen.',cause);}
  }

  function finish(current:Session){
    if(session!==current)return;
    session=null;detach(current);stopVideos(current.videoTracks);
    if(disposed)return;
    const blob=new Blob(current.chunks,{type:current.recorder.mimeType||current.chunks[0]?.type||'video/webm'});
    current.chunks=[];
    options.onStatus?.('idle');
    if(!blob.size){report('Inspelningen blev tom. Spela in ett nytt prov.');return;}
    try{
      ownedUrl=URL.createObjectURL(blob);
    }catch(error){report('Det gick inte att spara inspelningen. Försök igen.',error);return;}
    const timestamp=current.startedAt.toISOString().replace(/[:.]/g,'-');
    options.onReady?.({blob,url:ownedUrl,filename:`niva-duell-prov-${timestamp}.webm`});
  }

  function start(){
    if(disposed||session)return false;
    if(typeof canvas.captureStream!=='function'||typeof MediaRecorder==='undefined'||typeof MediaRecorder.isTypeSupported!=='function'||typeof MediaStream==='undefined'){
      report('Det går inte att spela in prov här.');return false;
    }
    if(canvas.width<=0||canvas.height<=0){report('Öppna spelbilden innan du startar inspelningen.');return false;}
    let videoTracks:MediaStreamTrack[]=[];
    try{
      const audioTracks=options.audioStream?.getAudioTracks().filter(track=>track.readyState==='live')??[];
      const candidates=audioTracks.length?['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
      const supported=candidates.filter(type=>MediaRecorder.isTypeSupported(type));
      if(!supported.length){report('Det går inte att spela in prov här.');return false;}
      const capture=canvas.captureStream(60);videoTracks=capture.getVideoTracks();
      if(!videoTracks.length){report('Det finns ingen spelbild att spela in.');return false;}
      const stream=new MediaStream([...videoTracks,...audioTracks]);
      let lastError:unknown;
      for(const mimeType of supported){
        let current:Session|null=null;
        try{
          const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8_000_000,...(audioTracks.length?{audioBitsPerSecond:128_000}:{})});
          current={recorder,videoTracks,chunks:[],startedAt:new Date(),timer:null};
          const recording=current;session=recording;
          recorder.ondataavailable=event=>{if(session===recording&&event.data.size)recording.chunks.push(event.data);};
          recorder.onstop=()=>finish(recording);
          recorder.onerror=event=>fail(recording,(event as Event&{error?:DOMException}).error??event);
          recorder.start(250);
          // Keep the previous completed clip usable if starting a new one fails.
          revokeUrl();
          recording.timer=setTimeout(stop,30_000);
          options.onStatus?.('recording');return true;
        }catch(error){
          lastError=error;
          if(current){
            if(session===current)session=null;
            detach(current);
            try{if(current.recorder.state!=='inactive')current.recorder.stop();}catch{}
          }
        }
      }
      stopVideos(videoTracks);report('Det gick inte att starta inspelningen. Försök igen.',lastError);return false;
    }catch(error){
      stopVideos(videoTracks);report('Det gick inte att starta inspelningen. Försök igen.',error);return false;
    }
  }

  function stop(){
    const current=session;if(!current||disposed)return;
    clearTimer(current);
    if(current.recorder.state==='inactive')return; // Final data and stop event may already be queued.
    options.onStatus?.('stopping');
    try{current.recorder.stop();}catch(error){fail(current,error);}
  }

  function dispose(){
    if(disposed)return;disposed=true;
    const current=session;session=null;
    if(current){
      detach(current);
      try{if(current.recorder.state!=='inactive')current.recorder.stop();}catch{}
      stopVideos(current.videoTracks);current.chunks=[];
    }
    revokeUrl();
  }

  return {start,stop,dispose};
}
