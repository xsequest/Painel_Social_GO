import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const vendor = new URL('assets/vendor/', root);
await mkdir(new URL('images/', vendor), { recursive: true });
const files = {
  'leaflet/dist/leaflet.js': 'leaflet.js',
  'leaflet/dist/leaflet.css': 'leaflet.css',
  'leaflet/dist/images/layers.png': 'images/layers.png',
  'leaflet/dist/images/layers-2x.png': 'images/layers-2x.png',
  'leaflet/dist/images/marker-icon.png': 'images/marker-icon.png',
  'leaflet/dist/images/marker-icon-2x.png': 'images/marker-icon-2x.png',
  'leaflet/dist/images/marker-shadow.png': 'images/marker-shadow.png',
  'chroma-js/chroma.min.js': 'chroma.min.js',
  'chart.js/dist/chart.umd.js': 'chart.umd.js',
  'topojson-client/dist/topojson-client.min.js': 'topojson-client.min.js',
  'leaflet/LICENSE': 'LICENSE-leaflet',
  'chroma-js/LICENSE': 'LICENSE-chroma-js',
  'chart.js/LICENSE.md': 'LICENSE-chart.js',
  'topojson-client/LICENSE': 'LICENSE-topojson-client'
};
for (const [source, destination] of Object.entries(files)) {
  await copyFile(new URL(`node_modules/${source}`, root), new URL(destination, vendor));
}
// Pin the distribution and record its digest so later builds reject upstream changes.
const spreadsheetURL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
const response = await fetch(spreadsheetURL);
if (!response.ok) throw new Error(`SheetJS: HTTP ${response.status}`);
const bytes = Buffer.from(await response.arrayBuffer());
const digest = createHash('sha256').update(bytes).digest('hex');
const manifestURL = new URL('vendor-manifest.json', import.meta.url);
let manifest;
try { manifest = JSON.parse(await readFile(manifestURL, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (manifest && manifest.sheetjs.sha256 !== digest) throw new Error('SheetJS integrity mismatch');
await writeFile(new URL('xlsx.full.min.js', vendor), bytes);
await writeFile(manifestURL, JSON.stringify({ sheetjs: { version: '0.20.3', url: spreadsheetURL, sha256: digest } }, null, 2) + '\n');
const licenseResponse = await fetch('https://cdn.sheetjs.com/xlsx-0.20.3/package/LICENSE');
if (!licenseResponse.ok) throw new Error(`SheetJS license: HTTP ${licenseResponse.status}`);
await writeFile(new URL('LICENSE-sheetjs', vendor), await licenseResponse.text());
