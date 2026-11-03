import {useEffect,useRef,useState} from 'react';
import {CONTROL_RANGES,DEFAULT_CONTROLS,cmPerTurn,normalizeControls,SETTINGS_KEY} from '../shared/controls.mjs';

export type Controls=ReturnType<typeof normalizeControls>;
export function storedControls():Controls{try{return normalizeControls(JSON.parse(localStorage.getItem(SETTINGS_KEY)??'{}'));}catch{return normalizeControls();}}
const fields=[['dpi','Mus-DPI','800'],['sensitivity','Muskänslighet','0,35'],['adsSensitivity','ADS-multiplikator','1'],['scopeSensitivity','Kikarsiktesmultiplikator','1']] as const;
export function Settings({value,onSave,onClose}:{value:Controls;onSave:(value:Controls)=>void;onClose:()=>void}){
  const [draft,setDraft]=useState(()=>Object.fromEntries(fields.map(([key])=>[key,String(value[key]).replace('.',',')]))),[options,setOptions]=useState(value),[error,setError]=useState('');
  const form=useRef<HTMLFormElement>(null);
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;form.current?.querySelector<HTMLInputElement>('input')?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();}
      if(event.key!=='Tab')return;
      const controls=[...form.current!.querySelectorAll<HTMLElement>('input,select,button')],first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    };
    document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);before?.focus();};
  },[]);
  const read=(key:string)=>Number(draft[key].trim().replace(',','.'));
  const distance=cmPerTurn(read('dpi'),read('sensitivity'));
  function save(event:React.FormEvent){
    event.preventDefault();const numbers:Record<string,number>={};
    for(const [key,label] of fields){const [min,max]=CONTROL_RANGES[key],n=read(key);if(!draft[key].trim()||!Number.isFinite(n)||n<min||n>max){setError(`${label}: ange ett tal mellan ${min.toLocaleString('sv-SE')} och ${max.toLocaleString('sv-SE')}.`);form.current?.querySelector<HTMLInputElement>(`#setting-${key}`)?.focus();return;}numbers[key]=n;}
    onSave(normalizeControls({...options,...numbers}));onClose();
  }
  return <div className="modal-backdrop" onClick={onClose}><form ref={form} className="settings panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={e=>e.stopPropagation()} onSubmit={save}>
    <div className="settings-heading"><div><span className="eyebrow">MUS & SIKTE</span><h2 id="settings-title">Ditt sikte. Din känsla.</h2></div><button type="button" className="icon-button" aria-label="Stäng inställningar" onClick={onClose}>×</button></div>
    <div className="control-fields">{fields.map(([key,label,placeholder])=><label key={key} htmlFor={`setting-${key}`}>{label}<input id={`setting-${key}`} inputMode="decimal" autoComplete="off" spellCheck={false} placeholder={placeholder} value={draft[key]} onChange={e=>{setDraft(v=>({...v,[key]:e.target.value}));setError('');}}/></label>)}</div>
    <p className="dpi-note">Ange samma DPI och muskänslighet som du använder i Valorant. DPI-värdet ändrar inte själva musen.</p>
    <output className="aim-distance">{Number.isFinite(distance)&&distance>0?`≈ ${distance.toLocaleString('sv-SE',{maximumFractionDigits:1})} cm för ett helt varv`:'Fyll i DPI och muskänslighet'}</output>
    <div className="control-fields aim-options"><label htmlFor="aim-mode">Sikta med gevär<select id="aim-mode" value={options.aimMode} onChange={e=>setOptions(v=>({...v,aimMode:e.target.value}))}><option value="hold">Håll höger musknapp</option><option value="toggle">Växla med högerklick</option></select></label><label htmlFor="scope-mode">Sikta med Operator<select id="scope-mode" value={options.scopeMode} onChange={e=>setOptions(v=>({...v,scopeMode:e.target.value}))}><option value="toggle">Växla 2,5× / 5× / av</option><option value="hold">Håll höger musknapp · 2,5×</option></select></label></div>
    <div className="settings-checks"><label className="check"><input type="checkbox" checked={options.sound} onChange={e=>setOptions(v=>({...v,sound:e.target.checked}))}/>Spelljud</label><label className="check"><input type="checkbox" checked={options.dynamicCrosshair} onChange={e=>setOptions(v=>({...v,dynamicCrosshair:e.target.checked}))}/>Visa rörelsefel i hårkorset</label></div>
    <fieldset className="reticle-settings"><legend>Hårkors</legend><div className="reticle-settings-grid"><div className="reticle-preview"><div className="crosshair" style={{'--gap':`${options.crosshairGap}px`,'--length':`${options.crosshairLength}px`,'--thickness':`${options.crosshairThickness}px`,color:options.crosshairColor} as React.CSSProperties}><i/><i/><i/><i/>{options.crosshairDot&&<span className="crosshair-dot"/>}</div></div><label>Färg<select value={options.crosshairColor} onChange={e=>setOptions(v=>({...v,crosshairColor:e.target.value}))}><option value="#a5ffe0">Mint</option><option value="#ffffff">Vit</option><option value="#00ffff">Cyan</option><option value="#00ff00">Grön</option><option value="#ff80d0">Rosa</option></select></label>{([['crosshairLength','Längd',1,12],['crosshairGap','Mellanrum',0,12],['crosshairThickness','Tjocklek',1,4]] as const).map(([key,label,min,max])=><label key={key}>{label} <output>{options[key]}</output><input type="range" min={min} max={max} step="1" value={options[key]} onChange={e=>setOptions(v=>({...v,[key]:Number(e.target.value)}))}/></label>)}<label className="check"><input type="checkbox" checked={options.crosshairDot} onChange={e=>setOptions(v=>({...v,crosshairDot:e.target.checked}))}/>Mittpunkt</label></div></fieldset>
    <p className="control-help">W A S D flyttar · Shift går tyst · Ctrl hukar · Mellanslag hoppar · R laddar om · Y inspekterar · 1 gevär · 2 pistol · 3 kniv · Classic högerklick skjuter tre kulor · Tab visar poäng · Esc släpper musen.</p>
    {error&&<p className="settings-error" role="alert">{error}</p>}
    <div className="settings-actions"><button type="button" className="text-button" onClick={()=>{setDraft(Object.fromEntries(fields.map(([key])=>[key,String(DEFAULT_CONTROLS[key]).replace('.',',')])));setOptions({...DEFAULT_CONTROLS});setError('');}}>Återställ standard</button><button className="primary" type="submit">Spara inställningar ✓</button></div>
  </form></div>;
}
