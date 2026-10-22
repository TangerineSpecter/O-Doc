import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import react from '@vitejs/plugin-react';

const frontend=fileURLToPath(new URL('../',import.meta.url));
const temporary=await mkdtemp(resolve(tmpdir(),'odoc-sprite-battle-'));
const destination=resolve(frontend,'../outputs/sprite-battle');
await build({root:frontend,configFile:false,plugins:[react()],base:'./',publicDir:false,
    build:{outDir:temporary,emptyOutDir:true,assetsInlineLimit:Infinity,cssCodeSplit:false,rollupOptions:{input:resolve(frontend,'sprite-battle-preview.html'),output:{inlineDynamicImports:true}}}});
let html=await readFile(resolve(temporary,'sprite-battle-preview.html'),'utf8');
const script=html.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/);
if(!script)throw new Error('Missing built script');
const javascript=await readFile(resolve(temporary,script[1]),'utf8');
html=html.replace(script[0],()=>`<script type="module">${javascript.replace(/<\/script/gi,'<\\/script')}</script>`);
const stylesheet=html.match(/<link\b[^>]*\bhref="([^"]+\.css)"[^>]*>/);
if(stylesheet){const css=await readFile(resolve(temporary,stylesheet[1]),'utf8');html=html.replace(stylesheet[0],()=>`<style>${css}</style>`);}
await mkdir(destination,{recursive:true});
const output=resolve(destination,'klee-sprite-battle.html');await writeFile(output,html);
await rm(temporary,{recursive:true,force:true});
console.log(`Standalone HTML: ${output} (${(Buffer.byteLength(html)/1024/1024).toFixed(1)} MiB)`);
