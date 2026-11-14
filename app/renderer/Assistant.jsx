import React, {useEffect,useRef,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import {api,ErrorMessage,Card} from './ui.jsx';

export function Assistant({active,openCard,openEvidence}) {
  const [works,setWorks]=useState([]),[workId,setWorkId]=useState(''),[state,setState]=useState(null);
  const [models,setModels]=useState([]),[modelId,setModelId]=useState('gemini-3.8-flash-low');
  const [text,setText]=useState(''),[memory,setMemory]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false);
  const request=useRef(null),current=useRef(workId);current.current=workId;
  useEffect(()=>{if(active)api('writing.list').then(v=>setWorks(v.works)).catch(setError);},[active]);
  useEffect(()=>{if(!workId){setState(null);return;}let live=true;
    api('assistant.get',{workId}).then(v=>{if(live){setState(v);setMemory(v.memory);if(v.modelId)setModelId(v.modelId);}}).catch(setError);
    const timer=setInterval(()=>api('assistant.get',{workId}).then(v=>{if(live)setState(v);}).catch(()=>{}),1000);
    return()=>{live=false;clearInterval(timer);};
  },[workId]);
  async function run(){setError(null);setBusy(true);const id=crypto.randomUUID();request.current=id;
    try {const v=await api('assistant.send',{workId,text,modelId,requestId:id});setState(v);setMemory(v.memory);setText('');}
    catch(e){setError(e);}finally{setBusy(false);request.current=null;}
  }
  return <section style={{padding:24,width:'100%',overflow:'auto',maxWidth:1100,margin:'0 auto'}} aria-label="创作助手">
    <h1>创作助手</h1><p>围绕本书讨论大纲和情节，优先参考本地知识库。主动发送后，相关创作资料将交给所选反重力模型；按需联网仅发送搜索词。</p>
    <ErrorMessage error={error}/>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
      <label>原创作品 <select aria-label="助手作品" value={workId} disabled={busy} onChange={e=>{setWorkId(e.target.value);setError(null);}}><option value="">请选择</option>{works.map(w=><option key={w.id} value={w.id}>{w.title}</option>)}</select></label>
      <button disabled={busy} onClick={()=>api('assistant.models').then(setModels).catch(setError)}>刷新反重力模型</button>
      <label>模型 <select aria-label="助手模型" value={modelId} disabled={busy} onChange={e=>setModelId(e.target.value)}>{!models.length&&<option value={modelId}>{modelId}</option>}{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    </div>
    {state&&<>
      <details><summary>本书任务与记忆（AGENTS.md）</summary><p style={{overflowWrap:'anywhere'}}>{state.workspace}</p>
        <textarea aria-label="本书助手记忆" value={memory} disabled={busy} onChange={e=>setMemory(e.target.value)} style={{width:'100%',minHeight:260}}/>
        <button disabled={busy} onClick={()=>api('assistant.memory',{workId,text:memory}).catch(setError)}>保存记忆</button>
        <button disabled={busy} onClick={()=>{setMemory(state.memory);}}>载入最新记忆</button>
      </details>
      <div role="log" aria-label="助手讨论记录">{state.messages.map((m,i)=><article key={i} style={{padding:'12px 0',borderBottom:'1px solid var(--border,#ddd)'}}><strong>{m.role==='user'?'你':'创作助手'}</strong><ReactMarkdown components={{a:({children,href})=><span>{children}（{href}）</span>}}>{m.text}</ReactMarkdown></article>)}</div>
      {busy&&<div role="status"><p>{state.activity||'正在思考…'}</p><ReactMarkdown>{state.partial||''}</ReactMarkdown></div>}
      {state.permissions?.map(p=><aside key={p.id} className="notice"><strong>反重力请求：{p.title}</strong><pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(p.input,null,2)}</pre>{p.options.filter(o=>o.kind!=='allow_always').map(o=><button key={o.optionId} onClick={()=>api('assistant.permission',{workId,id:p.id,optionId:o.optionId}).catch(setError)}>{o.name}</button>)}<button onClick={()=>api('assistant.permission',{workId,id:p.id}).catch(setError)}>拒绝</button></aside>)}
      {state.sources?.reason&&<p role="status">{state.sources.reason}</p>}
      {state.sources?.hits?.map((c,i)=><Card key={i} card={c} compact openCard={openCard} openEvidence={openEvidence}/>)}
      <label>讨论问题<textarea aria-label="助手问题" value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder="这里想给男主设置一个困境或任务……" style={{width:'100%',minHeight:100}}/></label>
      <button disabled={busy||!text.trim()} onClick={run}>{busy?'正在思考与检索…':'发送'}</button>
      {busy&&<button onClick={()=>api('request.cancel',{id:request.current}).catch(setError)}>停止</button>}
      <button disabled={busy} onClick={()=>{if(window.confirm('重新开始讨论？保留本书记忆，清空工作台中的当前聊天记录。'))api('assistant.reset',{workId}).then(setState).catch(setError);}}>重新开始讨论</button>
    </>}
  </section>;
}
