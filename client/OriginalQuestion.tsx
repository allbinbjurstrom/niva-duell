import {useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {Question} from './types';
GlobalWorkerOptions.workerSrc=workerUrl;
const documents=new Map<string,Promise<PDFDocumentProxy>>();
export function OriginalQuestion({question,onReady}:{question:Question;onReady:(ready:boolean)=>void}){
  const container=useRef<HTMLDivElement>(null),callback=useRef(onReady);callback.current=onReady;
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[zoom,setZoom]=useState(100),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let cancelled=false;const renders:{cancel:()=>void}[]=[];setError('');setLoading(true);callback.current(false);
    const mount=container.current!;mount.replaceChildren();
    const url=`/api/shooter/papers/${encodeURIComponent(question.paperId)}.pdf`;
    if(!documents.has(url))documents.set(url,getDocument({url,useSystemFonts:true,useWasm:false,disableRange:true}).promise.catch(error=>{documents.delete(url);throw error;}));
    void documents.get(url)!.then(async pdf=>{
      for(const number of question.pages){
        const page=await pdf.getPage(number);if(cancelled)return;
        const base=page.getViewport({scale:1}),available=Math.min(980,mount.clientWidth||800),scale=available/base.width*zoom/100,pixel=Math.min(devicePixelRatio,1.8);
        const canvas=document.createElement('canvas'),viewport=page.getViewport({scale:scale*pixel});
        canvas.width=viewport.width;canvas.height=viewport.height;canvas.style.width=`${viewport.width/pixel}px`;canvas.style.height=`${viewport.height/pixel}px`;canvas.setAttribute('role','img');canvas.setAttribute('aria-label',`Originalprov, sida ${number}. Uppgift ${question.number}.`);mount.append(canvas);
        const task=page.render({canvas,viewport});renders.push(task);await task.promise;if(cancelled)return;
      }
      setLoading(false);callback.current(true);
    }).catch(error=>{if(cancelled||error.name==='RenderingCancelledException')return;setLoading(false);setError('Originalprovet kunde inte visas. Försök igen eller öppna originalet.');callback.current(false);});
    return()=>{cancelled=true;renders.forEach(task=>task.cancel());};
  },[question.id,zoom,retry]);
  return <div className="original">
    <div className="original-toolbar"><span>Originalprov · uppgift <b>{question.number}</b> · sida {question.pages.join(', ')}</span><div><button aria-label="Förminska originalprovet" disabled={zoom<=75} onClick={()=>setZoom(v=>v-25)}>−</button><span>{zoom}%</span><button aria-label="Förstora originalprovet" disabled={zoom>=175} onClick={()=>setZoom(v=>v+25)}>+</button><a href={`${question.sourceUrl}#page=${question.pages[0]}`} target="_blank" rel="noreferrer">Öppna original ↗</a></div></div>
    <div className="original-pages" ref={container} />
    {loading&&<p className="pdf-status" role="status"><span className="spinner"/>Visar originalprovet…</p>}
    {error&&<div className="pdf-status error" role="alert">{error}<button className="secondary" onClick={()=>setRetry(v=>v+1)}>Försök igen</button></div>}
  </div>;
}
