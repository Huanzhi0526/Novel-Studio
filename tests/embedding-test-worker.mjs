import readline from 'node:readline';
console.log(JSON.stringify({ type: 'ready' }));
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const req = JSON.parse(line);
  console.log(JSON.stringify({ id: req.id, vectors: req.texts.map(() => [1, 0]) }));
});
