import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const executable = createRequire(import.meta.url)('electron');
const dataDir = process.env.NOVEL_STUDIO_DATA_DIR || join(root, '.local', 'kb-v2-mvp', 'data', 'app-profile');

console.log(`Novel Studio KB v2 MVP isolated data: ${dataDir}`);
const child = spawn(executable, [root], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    NOVEL_STUDIO_DATA_DIR: dataDir,
    NOVEL_STUDIO_KB_V2: '1'
  }
});

child.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', code => {
  process.exitCode = code ?? 1;
});
