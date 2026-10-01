import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
for (const name of ['index.html','config.js','favicon.svg']) await copyFile(name, 'dist/' + name);
await cp('src', 'dist/src', { recursive: true });
console.log('Static site built in dist/');
