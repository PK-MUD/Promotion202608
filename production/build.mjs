import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
// Pin the reviewed report; never build from an unreviewed latest snapshot.
const source='https://raw.githubusercontent.com/PK-MUD/Promotion202608/bbaeadbdf4a8f48b4591c83feb525020b046c082/index.html';
const response=await fetch(source);
if(!response.ok) throw new Error('Cannot load reviewed dashboard');
const data=Buffer.from(await response.arrayBuffer());
// expected hash is set by the preparation step using the reviewed local file.
const manifest=JSON.parse(await readFile(new URL('./report-manifest.json',import.meta.url),'utf8'));
if(createHash('sha256').update(data).digest('hex')!==manifest.sha256) throw new Error('Dashboard snapshot checksum mismatch');
const compressed=gzipSync(data,{level:9});
if(compressed.length>4_000_000) throw new Error('Dashboard exceeds function response budget');
await mkdir('private',{recursive:true});
await writeFile('private/dashboard.html.gz',compressed);
console.log(`Reviewed dashboard packaged: ${data.length} bytes, ${compressed.length} compressed bytes`);
