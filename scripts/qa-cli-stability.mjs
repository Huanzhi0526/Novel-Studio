import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='.local/stability-20261115';await mkdir(root,{recursive:true});
for(let trial=1;trial<=3;trial++){
 const result=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--disable-warning=ExperimentalWarning','--test','tests/agy-status.test.mjs','tests/agy-provider.test.mjs','tests/stability-lifecycle.test.mjs','tests/embedding-provider.test.mjs'],{windowsHide:true});let output='';p.stdout.on('data',v=>output+=v);p.stderr.on('data',v=>output+=v);p.once('error',reject);p.once('exit',code=>resolve({code,output}));});
 await writeFile(`${root}/cli-faults-${trial}.log`,result.output);assert.equal(result.code,0,result.output);console.log(`Trial ${trial}: passed`);
}
