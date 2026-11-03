import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const index=JSON.parse(await readFile(new URL('../content/local-practice-sources.json',import.meta.url),'utf8'));
const output=new URL('../desktop-assets/papers/',import.meta.url);await mkdir(output,{recursive:true});
for(const paper of index.papers){
  const target=new URL(`${paper.id}.pdf`,output),hash=data=>createHash('sha256').update(data).digest('hex');
  let existing;try{existing=await readFile(target);}catch{}
  if(existing&&hash(existing)===paper.sha256)continue;
  const url=new URL(paper.source_url);if(url.hostname!=='www.studera.nu'||url.protocol!=='https:')throw new Error('Ogiltig originalkälla.');
  const response=await fetch(url,{signal:AbortSignal.timeout(30_000),redirect:'error'});if(!response.ok)throw new Error(`Originalprovet ${paper.id} kunde inte hämtas.`);
  const data=Buffer.from(await response.arrayBuffer());if(hash(data)!==paper.sha256)throw new Error(`Originalprovets kontrollsumma stämmer inte: ${paper.id}`);
  await writeFile(target,data);console.log(`Förberett original: ${paper.id}`);
}
console.log(`${index.papers.length} verifierade originalprov finns tillgängliga utan internet.`);
