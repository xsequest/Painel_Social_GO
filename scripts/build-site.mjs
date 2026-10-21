import { cp, mkdir, rm, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const destination = new URL('dist/', root);
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const path of ['index.html', 'assets', 'output']) {
  await cp(new URL(path, root), new URL(path, destination), { recursive: true });
}
await rm(new URL('assets/css/tailwind.css', destination));
await writeFile(new URL('.nojekyll', destination), '');
console.log('Site pronto em dist/');
