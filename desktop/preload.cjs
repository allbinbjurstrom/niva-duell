const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('nivaLan',Object.freeze({
  native:true,
  getControls:()=>ipcRenderer.invoke('niva-duell:controls:get'),
  saveControls:controls=>ipcRenderer.invoke('niva-duell:controls:save',controls),
  saveRecording:data=>ipcRenderer.invoke('niva-duell:recording:save',data),
  listParties:()=>ipcRenderer.invoke('niva-duell:list'),
  info:()=>ipcRenderer.invoke('niva-duell:info'),
  join:(address)=>ipcRenderer.invoke('niva-duell:join',address),
  home:()=>ipcRenderer.invoke('niva-duell:home'),
  onChange:callback=>{const listener=()=>callback();ipcRenderer.on('niva-duell:network',listener);return()=>ipcRenderer.removeListener('niva-duell:network',listener);}
}));
