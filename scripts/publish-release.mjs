import {readFileSync,readdirSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';

const {version}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
const tag=`v${version}`,repo=process.env.GITHUB_REPOSITORY;
assert.equal(repo,'allbinbjurstrom/niva-duell');assert.equal(process.env.GITHUB_REF_NAME,tag);
const directory=path.resolve(process.argv[2]??'release-assets');
const names=[`Niva-Duell-${version}-Mac-arm64.zip`,`Niva-Duell-${version}-Mac-x64.zip`];
const actual=readdirSync(directory);assert.deepEqual(actual.slice().sort(),names.slice().sort(),'complete platform asset set');
const checksums=names.map(name=>{
  const file=path.join(directory,name);assert.ok(statSync(file).size>10_000_000,`application is too small: ${name}`);
  return `${createHash('sha256').update(readFileSync(file)).digest('hex')}  ${name}`;
}).join('\n')+'\n';
const sums=path.join(directory,'SHA256SUMS.txt');writeFileSync(sums,checksums);
const gh=args=>execFileSync('gh',args.concat('--repo',repo),{encoding:'utf8'});
let existing;
try{existing=JSON.parse(gh(['release','view',tag,'--json','isDraft']));}catch{}
if(existing)assert.equal(existing.isDraft,true,'a published version must never be overwritten');
else gh(['release','create',tag,'--verify-tag','--draft','--prerelease','--title',`Nivå Duell ${version} — testversion`,'--notes-file','docs/RELEASE-NOTES.md']);
gh(['release','upload',tag,...names.map(name=>path.join(directory,name)),sums,'--clobber']);
console.log(`Draft release uploaded: https://github.com/${repo}/releases/tag/${tag}`);
