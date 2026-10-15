import { spawn } from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- TESTING SERVER, SHELL ASSETS & OFFLINE MANIFEST ---');
  const viteBin = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const port = 4173;

  const serverProc = spawn(process.execPath, [viteBin, 'preview', '--port', String(port)], {
    cwd: rootDir,
    stdio: 'pipe'
  });

  serverProc.stdout.on('data', d => {
    // console.log('[Vite stdout]', d.toString());
  });
  serverProc.stderr.on('data', d => {
    // console.log('[Vite stderr]', d.toString());
  });

  // Wait for server to bind
  await new Promise(r => setTimeout(r, 2000));

  try {
    // 1. Root /
    const rootRes = await fetchUrl(`http://localhost:${port}/`);
    assert.strictEqual(rootRes.statusCode, 200, 'Root / must return 200');
    assert(rootRes.body.includes('<div id="root"></div>'), 'Root HTML must contain #root div');
    assert(rootRes.body.includes('manifest.json'), 'Root HTML must link manifest.json');
    console.log('✓ PASS: Root / served valid HTML shell with manifest link');

    // 2. Manifest /manifest.json
    const manifestRes = await fetchUrl(`http://localhost:${port}/manifest.json`);
    assert.strictEqual(manifestRes.statusCode, 200, 'manifest.json must return 200');
    const manifest = JSON.parse(manifestRes.body);
    assert.strictEqual(manifest.short_name, 'SignalSAR');
    console.log('✓ PASS: manifest.json served with valid PWA configuration');

    // 3. Service Worker /sw.js
    const swRes = await fetchUrl(`http://localhost:${port}/sw.js`);
    assert.strictEqual(swRes.statusCode, 200, 'sw.js must return 200');
    assert(swRes.body.includes('signalsar-cache-v1'), 'sw.js must contain cache name');
    console.log('✓ PASS: sw.js served with offline caching lifecycle handlers');

    // 4. Icon /icon.svg
    const iconRes = await fetchUrl(`http://localhost:${port}/icon.svg`);
    assert.strictEqual(iconRes.statusCode, 200, 'icon.svg must return 200');
    assert(iconRes.body.includes('<svg'), 'icon.svg must return valid SVG markup');
    console.log('✓ PASS: icon.svg served for home screen installation');

    console.log('--- ALL SERVER & OFFLINE ASSET CHECKS PASSED! ---');
  } finally {
    serverProc.kill('SIGTERM');
  }
}

run().catch(err => {
  console.error('Server test failed:', err);
  process.exit(1);
});
