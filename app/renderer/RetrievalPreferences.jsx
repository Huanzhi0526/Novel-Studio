import React, { useEffect, useRef, useState } from 'react';
import { api } from './ui.jsx';
import { ExpansionPreferences } from './Preferences.jsx';

export function RetrievalPreferences({ kbV2, purpose = 'retrieval' }) {
  const expand = purpose === 'expand';
  const enabled = expand || kbV2;
  const label = expand ? '扩写' : '检索';
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);
  const [reload, setReload] = useState(0);
  const request = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    api(`${purpose}.provider.get`).then(value => {
      if (!live) return;
      setSaved(value); setDraft(value); setModels(value.models);
    }).catch(error => { if (live) setNotice({ error: true, text: error.message }); });
    return () => { live = false; };
  }, [enabled, purpose, reload]);

  useEffect(() => () => {
    if (request.current) api('request.cancel', { id: request.current }).catch(() => {});
  }, []);

  async function run(action) {
    setBusy(action); setNotice(null);
    const requestId = crypto.randomUUID();
    request.current = requestId;
    try {
      const value = await api(purpose + '.provider.' + action,
        action === 'save' ? { source: draft.source, modelId: draft.modelId } : { requestId });
      if (request.current !== requestId) return;
      if (action === 'listModels') {
        setModels(value.models);
        setNotice({ text: `已刷新 ${value.models.length} 个 Gemini 模型选项。` });
      } else if (action === 'save') {
        setSaved(value); setDraft(value);
        setNotice({ text: `${label}模型来源已保存，现有 API 配置保持不变。` });
      } else setNotice({ text: `连接成功：${value.modelId}。` });
    } catch (error) {
      if (request.current === requestId) setNotice({ error: true, text: error.message });
    } finally {
      if (request.current === requestId) { request.current = null; setBusy(''); }
    }
  }

  function cancel() {
    const id = request.current;
    request.current = null; setBusy('');
    setNotice({ text: '已取消。' });
    if (id) api('request.cancel', { id }).catch(() => {});
  }

  const selected = models.find(model => model.id === draft?.modelId);
  const family = selected?.family;
  const families = [...new Map(models.map(model => [model.family, model.familyName])).entries()];
  const variants = models.filter(model => model.family === family);
  const dirty = saved && draft && (saved.source !== draft.source || saved.modelId !== draft.modelId);
  const change = patch => { setDraft(value => ({ ...value, ...patch })); setNotice(null); };

  return <>
    {enabled && <section className="settings-preferences expansion-preferences" aria-labelledby={purpose + '-provider-heading'}>
      <h2 id={purpose + '-provider-heading'}>{label}模型来源</h2>
      <p>{expand ? '选择主动AI扩写使用的模型。扩写与检索各自保存选模，互不影响。' : '选择用于 AI 快速和 AI 深度翻书的模型。本地混合检索始终在本机运行。'}</p>
      {draft ? <div className="expansion-preferences-form">
        <label><span>模型来源</span>
          <select aria-label="模型来源" value={draft.source} disabled={Boolean(busy)} onChange={event => change({ source: event.target.value })}>
            <option value="auto">自动（优先已配 API，否则使用反重力）</option>
            <option value="api">兼容 API</option>
            <option value="agy">反重力账号额度</option>
          </select>
        </label>
        {draft.source !== 'api' && <>
          <p>复用本机反重力 CLI 的 Google 账号登录，无需填写 API Key。模型可用性和额度以该账号为准；未登录时请先在反重力中完成登录。</p>
          <div className="button-row">
            <button type="button" disabled={Boolean(busy)} onClick={() => run('listModels')}>刷新反重力模型</button>
            {busy === 'listModels' && <button type="button" onClick={cancel}>取消刷新</button>}
          </div>
          <label><span>反重力模型</span>
            <select aria-label="反重力模型" value={family ?? ''} disabled={Boolean(busy) || !models.length} onChange={event => {
              const options = models.filter(model => model.family === event.target.value);
              change({ modelId: (options.find(model => model.effort === 'low') ?? options[0]).id });
            }}>
              {!selected && <option value="">{draft.modelId}（刷新列表确认）</option>}
              {families.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label><span>思考强度</span>
            <select aria-label="思考强度" value={selected?.id ?? draft.modelId} disabled={Boolean(busy) || !selected} onChange={event => change({ modelId: event.target.value })}>
              {!selected && <option value={draft.modelId}>待刷新模型列表</option>}
              {variants.map(model => <option key={model.id} value={model.id}>{model.effort ?? '模型默认'}</option>)}
            </select>
          </label>
          <small>列表来自本机 CLI，列出不代表逐个推理测试成功。{expand ? '额度不足或调用失败会保留原稿并显示原因，不自动换模型生成。' : '额度不足或调用失败会显示原因，并回退本地检索。'}</small>
        </>}
        <div className="button-row">
          <button type="button" className="primary" disabled={Boolean(busy) || !dirty} onClick={() => run('save')}>保存模型来源</button>
          {draft.source !== 'api' && <button type="button" disabled={Boolean(busy) || Boolean(dirty)} onClick={() => run('test')}>测试反重力连接</button>}
          {busy === 'test' && <button type="button" onClick={cancel}>取消测试</button>}
          {dirty && <button type="button" disabled={Boolean(busy)} onClick={() => { setDraft(saved); setNotice(null); }}>取消来源修改</button>}
        </div>
        <small>连接测试只发送固定测试句。更换来源不会删除 API 配置；切回自动或兼容 API 后仍可继续使用。</small>
      </div> : <button type="button" onClick={() => setReload(value => value + 1)}>重试读取模型来源</button>}
      {busy && <p role="status">{busy === 'listModels' ? '正在读取账号可用模型…' : busy === 'test' ? '正在测试所选模型…' : '正在保存…'}</p>}
      {notice && <p className={`notice ${notice.error ? 'danger' : 'success'}`} role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    </section>}
    <div hidden={enabled && draft?.source === 'agy'}><ExpansionPreferences purpose={purpose === 'expand' ? 'expand' : 'retrieval'} /></div>
  </>;
}
