import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRecordingStore} from '../desktop/recordings.cjs';
const video=Buffer.from([0x1a,0x45,0xdf,0xa3,1,2,3,4]);
test('native recording save preserves bytes and generates unique names inside its fixed directory',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'niva-recording-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=createRecordingStore(dir),a=await store.save(video),b=await store.save(Uint8Array.from(video).buffer);
 assert.notEqual(a.filename,b.filename);assert.equal(a.directory,dir);assert.match(a.filename,/^niva-duell-prov-[A-Za-z0-9-]+\.webm$/);assert.deepEqual(await fs.readFile(path.join(dir,a.filename)),video);assert.deepEqual(await fs.readFile(path.join(dir,b.filename)),video);assert.equal((await fs.readdir(dir)).length,2);
});
test('native save rejects path-shaped objects, invalid formats and excessive bytes without creating files',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'niva-recording-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=createRecordingStore(dir,{maxBytes:7});
 await assert.rejects(store.save({filename:'../../outside.webm',data:video}));await assert.rejects(store.save(Buffer.from('nope')));await assert.rejects(store.save(video));assert.deepEqual(await fs.readdir(dir),[]);
});
test('native save respects a typed-array view rather than leaking unrelated backing bytes',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'niva-recording-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const store=createRecordingStore(dir),buffer=Buffer.concat([Buffer.from('private-prefix'),video,Buffer.from('private-suffix')]);const result=await store.save(buffer.subarray(14,22));assert.deepEqual(await fs.readFile(path.join(dir,result.filename)),video);
});
