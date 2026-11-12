import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const executable = createRequire(import.meta.url)('electron');
const dataDir = process.env.NOVEL_STUDIO_DATA_DIR || join(root, '.local', 'dev-profile');
console.log(`Novel Studio development data: ${dataDir}`);
const app = spawn(executable, [root], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, NOVEL_STUDIO_DATA_DIR: dataDir }
});
app.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
app.on('exit', code => { process.exitCode = code ?? 1; });
