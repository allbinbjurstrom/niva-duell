import {readFile,writeFile} from 'node:fs/promises';
const packages=['react','react-dom','three','pdfjs-dist','ws'];
let notices='Nivå Duell — programbibliotek och licenser\n\nArenan, gränssnittet, figurerna och vapenmodellerna är Nivås egna.\nOriginalprovens källor anges i frågevyn och Nivås källindex.\nElectron och Chromium har ytterligare licenser i Mac-appens körmiljö.\n';
for(const name of packages){notices+=`\n\n${'='.repeat(70)}\n${name}\n${'='.repeat(70)}\n\n`+await readFile(new URL(`../node_modules/${name}/LICENSE`,import.meta.url),'utf8');}
notices+='\n\nIBM Plex Sans\n\n'+await readFile(new URL('../public/fonts/LICENSE.txt',import.meta.url),'utf8');
await writeFile(new URL('../public/THIRD-PARTY-NOTICES.txt',import.meta.url),notices);
