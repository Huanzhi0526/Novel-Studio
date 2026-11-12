import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import './expansion-dialog.css';

export function ExpansionDialog({ api, snapshot, onPreview, onClose, onOpenSettings }) {
  const dialog = useRef(null);
  const activeRequest = useRef(null);
  const [useMaterials, setUseMaterials] = useState(snapshot.useMaterials ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [stopped, setStopped] = useState(false);

  function cancelRequest() {
    const requestId = activeRequest.current;
    if (!requestId) return;
    activeRequest.current = null;
    void api('expand.cancel', { requestId }).catch(() => {});
  }

  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => {
      cancelRequest();
      node.close();
    };
  }, [api]);

  async function generate() {
    if (activeRequest.current) return;
    const requestId = crypto.randomUUID();
    activeRequest.current = requestId;
    setPending(true);
    setError(null);
    setStopped(false);
    try {
      const { workId, docId, chapterText, from, to } = snapshot;
      const response = await api('expand.generate', { requestId, workId, docId, chapterText, from, to, useMaterials });
      if (activeRequest.current === requestId) {
        const message = onPreview(response.text, useMaterials);
        if (message) setError({ message });
      }
    } catch (failure) {
      if (activeRequest.current === requestId) setError(failure);
    } finally {
      if (activeRequest.current === requestId) {
        activeRequest.current = null;
        setPending(false);
      }
    }
  }

  function stop() {
    cancelRequest();
    setPending(false);
    setStopped(true);
  }

  return <dialog ref={dialog} className="modal expansion-dialog" aria-labelledby="expansion-dialog-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="modal-head">
      <div><h2 id="expansion-dialog-title">AI 扩写</h2></div>
      <button className="icon-button" type="button" onClick={onClose} aria-label="关闭扩写"><Icon name="close" /></button>
    </header>
    <section className="expansion-instruction" aria-labelledby="expansion-instruction-label">
      <h3 id="expansion-instruction-label">括号内的提示</h3>
      <p>{snapshot.prompt}</p>
    </section>
    <div className="expansion-options">
      <label><input type="checkbox" checked={useMaterials} disabled={pending}
        onChange={event => { setUseMaterials(event.target.checked); setError(null); setStopped(false); }} />
        同时读取本作品的大纲、角色和设定</label>
      <p>生成时会把提示和当前章节的必要片段发送给已配置的模型。长章只取选区附近的内容。
        {useMaterials && ' 已勾选本作品的创作资料，相关内容会一同发送。'}</p>
    </div>
    {pending && <p className="inline-status expansion-status" role="status"><span className="spinner" />正在生成预览…</p>}
    {stopped && <p className="expansion-status" role="status">已停止生成。</p>}
    {error && <div className="expansion-error" role="alert">
      <span>{error.code === 'EXPAND_NOT_CONFIGURED' ? '请在「资料与设置 → AI 扩写」配置模型。' : error.message || '扩写失败，请重试。'}</span>
      {error.code === 'EXPAND_NOT_CONFIGURED' && onOpenSettings &&
        <button type="button" onClick={onOpenSettings}>打开设置</button>}
    </div>}
    <footer className="expansion-actions">
      {pending
        ? <button type="button" onClick={stop}>停止生成</button>
        : <>
          <button type="button" onClick={onClose}>取消</button>
          <button type="button" className="primary-button" onClick={generate}>生成预览</button>
        </>}
    </footer>
  </dialog>;
}
