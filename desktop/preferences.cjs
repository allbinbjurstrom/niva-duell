const fs=require('node:fs');
const path=require('node:path');
exports.createControlStore=(file,normalize)=>({
  read(){try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));return saved.version===1?normalize(saved.controls):null;}catch{return null;}},
  save(value){const controls=normalize(value);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify({version:1,controls})+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);return controls;}
});
