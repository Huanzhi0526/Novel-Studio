import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const run=promisify(execFile);
export async function captureAntigravityUsage({executable,filename,cwd}){
 const {stdout}=await run(executable,['--model','gemini-3.8-flash-low','--effort','low','--output-format','json','--print','/usage'],{cwd,windowsHide:true,timeout:30000,maxBuffer:1024*1024});
 const result=JSON.parse(stdout);
 if(result.command?.name!=='usage'||result.num_turns!==0)throw Error('Expected a zero-model-turn built-in usage result');
 const snapshot={capturedAt:new Date().toISOString(),...result};
 await writeFile(filename,JSON.stringify(snapshot,null,2));return snapshot;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 if(!process.argv[2])throw Error('指定额度快照输出文件');
 await captureAntigravityUsage({executable:'C:/Users/78828/AppData/Local/agy/bin/agy.exe',filename:resolve(process.argv[2]),cwd:process.cwd()});
}
