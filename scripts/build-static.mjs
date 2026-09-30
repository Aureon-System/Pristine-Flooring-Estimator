import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'dist');
const ROOT_PUBLIC_EXTENSIONS = new Set(['.html','.css','.js','.ico','.webmanifest','.txt']);

await rm(OUT,{recursive:true,force:true});
await mkdir(OUT,{recursive:true});

for (const entry of await readdir(ROOT,{withFileTypes:true})) {
  if (!entry.isFile()) continue;
  if (!ROOT_PUBLIC_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
  await cp(join(ROOT,entry.name),join(OUT,entry.name));
}

await cp(join(ROOT,'assets'),join(OUT,'assets'),{recursive:true});

console.log(`Prepared safe static bundle in ${OUT}`);
