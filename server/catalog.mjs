import {readFileSync,existsSync} from 'node:fs';
import {createHash,randomInt} from 'node:crypto';
import {SECTIONS} from '../shared/rules.mjs';

// Reuse Nivå's verified source references. Question wording and answer keys never enter the client bundle.
export function loadCatalog(file=process.env.NIVA_DUELL_CATALOG??new URL('../content/local-practice-sources.json',import.meta.url)){
  const index=JSON.parse(readFileSync(file,'utf8'));
  if(index.format!=='niva-practice-source-index'||index.version!==1)throw new Error('Ogiltigt frågeindex.');
  const papers=new Map(),questions=[];
  for(const p of index.papers){
    const url=new URL(p.source_url);
    if(url.protocol!=='https:'||url.hostname!=='www.studera.nu'||!url.pathname.endsWith('.pdf')||!/^[a-f0-9]{64}$/.test(p.sha256))throw new Error('Ogiltig originalkälla.');
    const groups=p.id==='uhr-elf-example'?[['ELF',20]]:p.kind==='quant'?[['XYZ',12],['KVA',10],['NOG',6],['DTK',12]]:[['ORD',10],['LÄS',10],['MEK',10]];
    const sections=groups.flatMap(([s,n])=>Array(n).fill(s));
    if(p.answers.length!==sections.length||p.pages.length!==sections.length)throw new Error('Ofullständigt frågeunderlag.');
    papers.set(p.id,p);
    sections.forEach((section,i)=>questions.push({id:`${p.id}-q${i+1}`,section,number:i+1,pages:p.pages[i],paperId:p.id,title:p.title,
      sourceUrl:p.source_url,options:[...(['ORD','NOG'].includes(section)?'ABCDE':'ABCD')],answer:p.answers[i]}));
  }
  const cache=new Map(),pending=new Map();
  return {
    sections:Object.entries(SECTIONS).filter(([key])=>questions.filter(q=>q.section===key).length>=5).map(([id,name])=>({id,name})),
    choose(section,count,used=new Set()){
      let pool=questions.filter(q=>q.section===section&&!used.has(q.id));
      if(pool.length<count)pool=questions.filter(q=>q.section===section);
      if(pool.length<count)throw new Error('Det finns inte tillräckligt många originalfrågor i ämnet.');
      const result=[];while(result.length<count){const i=randomInt(pool.length);result.push(pool.splice(i,1)[0]);}return result;
    },
    async pdf(id){
      const paper=papers.get(id);if(!paper)throw new Error('Originalprovet finns inte.');
      if(cache.has(id))return cache.get(id);
      if(pending.has(id))return pending.get(id);
      const task=(async()=>{
        const local=new URL(`../desktop-assets/papers/${id}.pdf`,import.meta.url);
        if(existsSync(local)){
          const data=readFileSync(local);
          if(createHash('sha256').update(data).digest('hex')!==paper.sha256)throw new Error('Originalprovet i appen är skadat. Installera om appen.');
          if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(id,data);return data;
        }
        const response=await fetch(paper.source_url,{signal:AbortSignal.timeout(20_000),redirect:'error'});
        if(!response.ok)throw new Error('Originalprovet kunde inte hämtas från Studera.nu. Försök igen.');
        const data=Buffer.from(await response.arrayBuffer());
        if(data.length>20_000_000||createHash('sha256').update(data).digest('hex')!==paper.sha256)throw new Error('Originalprovets kontrollsumma stämmer inte.');
        if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(id,data);return data;
      })().finally(()=>pending.delete(id));
      pending.set(id,task);return task;
    }
  };
}
