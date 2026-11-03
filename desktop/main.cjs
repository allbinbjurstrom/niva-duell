const trace=(stage)=>{if(process.env.NIVA_DUELL_DEBUG==='1')console.error('[Nivå Duell]',stage);};
trace('main:enter');
const {app,BrowserWindow,ipcMain,Menu,shell,dialog,screen}=require('electron');
trace('main:electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {createDiscovery,privateIPv4}=require('./lan.cjs');
const {createControlStore}=require('./preferences.cjs');
const {createRecordingStore}=require('./recordings.cjs');
let window,runtime,server,discovery,localOrigin,allowedOrigin,stopping=false;
if(!app.requestSingleInstanceLock())app.quit();
else{
  trace('main:lock');
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(async()=>{
    trace('main:ready');
    if(app.isPackaged)process.env.NIVA_DUELL_CATALOG=path.join(process.resourcesPath,'practice-sources.json');
    const {createShooterServer}=await import(pathToFileURL(path.join(app.getAppPath(),'server/index.mjs')).href);
    const {RULES}=await import(pathToFileURL(path.join(app.getAppPath(),'shared/rules.mjs')).href);
    const {normalizeControls}=await import(pathToFileURL(path.join(app.getAppPath(),'shared/controls.mjs')).href);
    const controls=createControlStore(path.join(app.getPath('userData'),'controls-v1.json'),normalizeControls),recordings=createRecordingStore(app.getPath('downloads'));
    trace('main:runtime');
    ({server,runtime}=createShooterServer());
    let port=5205;
    for(;port<5220;port++){
      try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',()=>{server.removeListener('error',reject);resolve();});});break;}
      catch(error){if(error.code!=='EADDRINUSE')throw error;}
    }
    if(port===5220)throw new Error('Det finns ingen ledig port för LAN-spelet.');
    trace('main:listening');
    localOrigin=`http://127.0.0.1:${port}`;allowedOrigin=localOrigin;
    discovery=createDiscovery({port,engine:runtime.engine,onChange:()=>{if(window&&!window.isDestroyed())window.webContents.send('niva-duell:network');}});
    const area=screen.getPrimaryDisplay().workAreaSize;
    window=new BrowserWindow({width:Math.min(1440,area.width),height:Math.min(960,area.height),minWidth:Math.min(1000,area.width),minHeight:Math.min(700,area.height),title:'Nivå Duell',backgroundColor:'#101d29',
      ...(process.platform==='darwin'?{titleBarStyle:'hiddenInset',trafficLightPosition:{x:18,y:19}}:{autoHideMenuBar:true,icon:path.join(app.getAppPath(),'build/icon.png')}),
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    trace('main:window');
    const trusted=event=>event.sender===window.webContents&&event.senderFrame===window.webContents.mainFrame;
    ipcMain.handle('niva-duell:controls:get',event=>trusted(event)?controls.read():null);
    ipcMain.handle('niva-duell:controls:save',(event,value)=>{if(!trusted(event))throw new Error('Inställningarna kunde inte sparas.');return controls.save(value);});
    ipcMain.handle('niva-duell:recording:save',(event,data)=>{if(!trusted(event))throw new Error('Provet kunde inte sparas.');return recordings.save(data);});
    ipcMain.handle('niva-duell:list',event=>trusted(event)?discovery.list():[]);
    ipcMain.handle('niva-duell:info',event=>trusted(event)?discovery.info():null);
    ipcMain.handle('niva-duell:home',event=>{if(!trusted(event))return;allowedOrigin=localOrigin;return window.loadURL(localOrigin+'/?home=1');});
    ipcMain.handle('niva-duell:join',async(event,value)=>{
      if(!trusted(event)||!value||!privateIPv4(value.ip)||!Number.isInteger(value.port)||value.port<1024||value.port>65535||!/^[A-Z]{3}$/.test(value.code))throw new Error('Ange värdens lokala IP-adress, port och partykod med tre bokstäver.');
      const target=`http://${value.ip}:${value.port}`;
      const health=await fetch(target+'/api/shooter/health',{signal:AbortSignal.timeout(4000)}).then(r=>r.json());
      if(health.mode!=='niva-duell')throw new Error('Det finns ingen Nivå Duell-värd på den adressen.');
      if(health.protocol!==RULES.protocolVersion)throw new Error(`Olika appversioner. Uppdatera båda till ${app.getVersion()}.`);
      allowedOrigin=target;await window.loadURL(`${target}/?party=${value.code}&join=1`);
    });
    window.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.protocol==='https:'&&['www.studera.nu','niva.ovaron.se'].includes(u.hostname))void shell.openExternal(url);}catch{}return {action:'deny'};});
    window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==allowedOrigin)event.preventDefault();});
    window.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(contents===window.webContents&&['pointerLock','fullscreen','clipboard-sanitized-write'].includes(permission)));
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      process.platform==='darwin'?{label:'Nivå Duell',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{type:'separator'},{role:'quit'}]}:{label:'Arkiv',submenu:[{role:'quit'}]},
      {label:'Redigera',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'Visa',submenu:[{role:'reload'},{role:'togglefullscreen'},...(!app.isPackaged?[{role:'toggleDevTools'}]:[])]}
    ]));
    await window.loadURL(localOrigin);
    trace('main:loaded');
  }).catch(error=>{trace(error.stack??error.message);dialog.showErrorBox('Nivå Duell kunde inte starta',String(error.message));app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{if(stopping)return;stopping=true;discovery?.close();runtime?.close();server?.close();});
}
