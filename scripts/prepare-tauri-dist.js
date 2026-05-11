const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tauri-dist');
const entries = ['index.html', 'styles', 'scripts', 'assets'];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const entry of entries) {
  const source = path.join(root, entry);
  if (!fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(outDir, entry), {
    recursive: true,
    filter: sourcePath => !/scripts[\\/](?:test-|bridge-test|smoke-test|check-js|prepare-tauri-dist)/.test(path.relative(root, sourcePath))
  });
}

for (const file of ['prepare-tauri-dist.js', 'check-js.js', 'bridge-test.js', 'smoke-test.js', 'test-mcp-host.js', 'test-mcp-leak-tester.js']) {
  fs.rmSync(path.join(outDir, 'scripts', file), { force: true });
}

console.log(`Prepared Tauri frontend at ${path.relative(root, outDir)}`);
