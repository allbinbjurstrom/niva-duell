const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

// A narrow native save operation: only video bytes, only the app's Downloads
// destination, and a name generated here. The renderer supplies no file path.
function createRecordingStore(directory,{maxBytes=64*1024*1024}={}){
  let saving=false;
  return {async save(data){
    if(saving)throw new Error('Ett prov håller redan på att sparas.');
    if(!(data instanceof ArrayBuffer)&&!ArrayBuffer.isView(data))throw new Error('Provet kunde inte läsas.');
    const bytes=data instanceof ArrayBuffer?Buffer.from(data):Buffer.from(data.buffer,data.byteOffset,data.byteLength);
    if(bytes.length<4||bytes.length>maxBytes)throw new Error('Provet är tomt eller för stort för att sparas.');
    if(bytes.readUInt32BE(0)!==0x1a45dfa3)throw new Error('Provet har inget giltigt videoformat.');
    const filename=`niva-duell-prov-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.webm`;
    saving=true;
    try{await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,filename),bytes,{flag:'wx'});return {filename,directory};}
    catch{throw new Error('Provet kunde inte sparas i Hämtade filer.');}
    finally{saving=false;}
  }};
}
module.exports={createRecordingStore};
