// Local ACP fixture. Never connects to an account or model.
import {createInterface} from 'node:readline';
let server,sequence=0;
const send=message=>process.stdout.write(JSON.stringify(message)+'\n');
async function rpc(method,params){const response=await fetch(server.url,{method:'POST',headers:Object.fromEntries(server.headers.map(h=>[h.name,h.value])),body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})});const data=await response.json();if(data.error)throw new Error(data.error.message);return data.result;}
for await(const line of createInterface({input:process.stdin})){
 const m=JSON.parse(line);if(!m.id)continue;
 try{
  let result={};
  if(m.method==='initialize')result={agentCapabilities:{loadSession:false}};
  if(m.method==='session/new'){server=m.params.mcpServers[0];if(server){await rpc('initialize',{});await rpc('tools/list',{});}result={sessionId:'synthetic-session'};}
  if(m.method==='session/set_config_option')result={configOptions:[{id:'thought_level',currentValue:m.params.value}]};
  if(m.method==='session/prompt'){
   const response=await rpc('tools/call',{name:'reference_search',arguments:{query:'合作任务',mode:'fast'}});
   const job=JSON.parse(response.content[0].text);let value;
   do{const received=await rpc('tools/call',{name:'reference_result',arguments:{jobId:job.jobId}});if(received.isError)throw new Error(received.content[0].text);value=JSON.parse(received.content[0].text);}while(['running','queued'].includes(value.status));
   if(value.status!=='done')throw new Error('synthetic retrieval failed');
   send({method:'session/update',params:{sessionId:m.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{text:'合成助手已领取参考结果。'}}}});result={stopReason:'end_turn'};
  }
  send({id:m.id,result});
 }catch(error){send({id:m.id,error:{message:error.message}});}
}
