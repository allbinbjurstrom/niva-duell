import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import asar from '@electron/asar';

const root=fileURLToPath(new URL('..',import.meta.url)),hash=data=>createHash('sha256').update(data).digest('hex');
const pkg=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
const catalog=readFileSync(path.join(root,'content/local-practice-sources.json'));
const {papers}=JSON.parse(catalog);
const candidates=process.platform==='win32'?[path.join(root,'release/win-unpacked')]:[path.join(root,'release/mac-arm64/Niva Duell.app'),path.join(root,'release/mac/Niva Duell.app')];
function files(dir){return readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(`${dir}/${entry.name}`):[`${dir}/${entry.name}`]);}
const runtime=['dist','server','shared','desktop'].flatMap(files).concat('build/icon.png');
let checked=0;
for(const app of candidates){
  if(!existsSync(app))continue;
  const resources=path.join(app,process.platform==='win32'?'resources':'Contents/Resources'),archive=path.join(resources,'app.asar');
  assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,pkg.version);
  assert.equal(hash(readFileSync(path.join(resources,'practice-sources.json'))),hash(catalog),'standalone catalog');
  assert.equal(JSON.parse(asar.extractFile(archive,'node_modules/ws/package.json')).version,pkg.dependencies.ws);
  for(const file of runtime)assert.equal(hash(asar.extractFile(archive,file)),hash(readFileSync(path.join(root,file))),`packaged source: ${file}`);
  for(const paper of papers)assert.equal(hash(asar.extractFile(archive,`desktop-assets/papers/${paper.id}.pdf`)),paper.sha256,`original paper: ${paper.id}`);
  if(process.platform==='darwin')execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
  checked++;console.log(`Verified ${path.basename(app)}: version ${pkg.version}, ${runtime.length} runtime files, ${papers.length} original papers.`);
}
assert.equal(checked,process.platform==='win32'?1:2,'all expected platform packages must exist');
