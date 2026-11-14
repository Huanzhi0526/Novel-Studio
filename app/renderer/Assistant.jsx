import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api, Card, ConfirmDialog, ErrorMessage, Icon } from './ui.jsx';
import { sendIntent } from './input-keys.mjs';
import './assistant.css';

export function useAssistantController() {
  const [works, setWorks] = useState([]);
  const [workId, setWorkId] = useState('');
  const [state, setState] = useState(null);
  const [models, setModels] = useState([]);
  const [modelId, setModelId] = useState('gemini-3.8-flash-low');
  const [drafts, setDrafts] = useState({});
  const [memory, setMemory] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const request = useRef(null);
  const current = useRef(workId);
  const syncEpoch = useRef(0);
  current.current = workId;
  const busy = pending || Boolean(state?.busy);

  const refreshWorks = useCallback(async () => {
    try {
      setWorks((await api('writing.list')).works);
    } catch (e) {
      setError(e);
    }
  }, []);

  const refreshState = useCallback(async (id = current.current, initial = false) => {
    if (!id) return null;
    const epoch = ++syncEpoch.current;
    try {
      const v = await api('assistant.get', { workId: id });
      if (current.current === id && syncEpoch.current >= epoch) {
        setState(v);
        if (initial) {
          setMemory(v.memory);
          if (v.modelId) setModelId(v.modelId);
        }
      }
      return v;
    } catch (e) {
      if (current.current === id) setError(e);
      return null;
    }
  }, []);

  useEffect(() => { void refreshWorks(); }, [refreshWorks]);

  useEffect(() => {
    syncEpoch.current++;
    setState(null);
    setError(null);
    if (!workId) return;
    let live = true;
    async function load() {
      try {
        const v = await api('assistant.get', { workId });
        if (live) {
          setState(v);
          setMemory(v.memory);
          if (v.modelId) setModelId(v.modelId);
        }
      } catch (e) {
        if (live) setError(e);
      }
    }
    void load();
    return () => { live = false; };
  }, [workId]);

  useEffect(() => {
    if (!workId || !busy) return;
    let live = true;
    async function poll() {
      const epoch = syncEpoch.current;
      try {
        const v = await api('assistant.get', { workId });
        if (live && epoch === syncEpoch.current) setState(v);
      } catch (e) {
        if (live) setError(e);
      }
    }
    const timer = setInterval(() => void poll(), 1000);
    return () => { live = false; clearInterval(timer); };
  }, [workId, busy]);

  async function run() {
    if (busy || !drafts[workId]?.trim()) return;
    setError(null);
    setPending(true);
    const book = workId;
    const sent = drafts[book];
    const id = crypto.randomUUID();
    request.current = id;
    try {
      const v = await api('assistant.send', { workId: book, text: sent, modelId, requestId: id });
      syncEpoch.current++;
      if (current.current === book) {
        setState(v);
        setMemory(v.memory);
      }
      setDrafts(d => (d[book] === sent ? { ...d, [book]: '' } : d));
    } catch (e) {
      syncEpoch.current++;
      if (current.current === book) {
        setError(e);
        try {
          const v = await api('assistant.get', { workId: book });
          if (current.current === book) setState(v);
        } catch {}
      }
    } finally {
      setPending(false);
      request.current = null;
    }
  }

  return {
    works, workId, setWorkId, state, models, modelId, setModelId, memory, setMemory, error, setError, busy,
    run, refreshWorks, refreshState,
    text: drafts[workId] ?? '',
    setText: text => setDrafts(d => ({ ...d, [workId]: text })),
    refreshModels: () => api('assistant.models').then(setModels).catch(setError),
    stop: () => api('request.cancel', { id: request.current ?? state?.requestId }).catch(setError),
    saveMemory: async () => {
      const savedText = memory;
      try {
        await api('assistant.memory', { workId, text: savedText });
        if (current.current === workId) {
          setState(s => (s ? { ...s, memory: savedText } : s));
        }
      } catch (e) {
        setError(e);
      }
    },
    reset: () => {
      api('assistant.reset', { workId }).then(v => {
        syncEpoch.current++;
        setState(v);
      }).catch(setError);
    }
  };
}

const Markdown = ({ children }) => (
  <ReactMarkdown components={{ a: ({ children, href }) => <span className="assistant-source-link">{children}<small>{href}</small></span> }}>
    {children}
  </ReactMarkdown>
);

const MessageList = React.memo(function MessageList({ messages }) {
  return <div role="log" aria-label="助手讨论记录" className="assistant-messages">
    {messages?.map((m, i) => <article key={i} className={`assistant-message message-${m.role}`}>
      <div className="assistant-message-label">{m.role === 'user' ? '你的构思' : '创作助手'}</div>
      <div className="assistant-prose"><Markdown>{m.text}</Markdown></div>
    </article>)}
  </div>;
}, (prev, next) => {
  const a = prev.messages;
  const b = next.messages;
  if (a === b) return true;
  if ((a?.length ?? 0) !== (b?.length ?? 0)) return false;
  if (!a?.length) return true;
  const lastA = a[a.length - 1];
  const lastB = b[b.length - 1];
  return lastA.role === lastB.role && lastA.text === lastB.text;
});

export function Assistant({ active, controller: c, openCard, openEvidence, compact = false, boundWorkId, onClose }) {
  const { works, workId, state, models, modelId, error, busy, text, memory } = c;
  const scroll = useRef(null);
  const follow = useRef(true);
  const wasActive = useRef(false);
  const menuRef = useRef(null);
  const menuTriggerRef = useRef(null);
  const memoryCloseBtnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);

  useEffect(() => {
    const prev = wasActive.current;
    wasActive.current = active;
    if (active && !prev) {
      void c.refreshWorks();
      if (workId) void c.refreshState(workId);
    }
  }, [active, workId, c.refreshWorks, c.refreshState]);

  useEffect(() => {
    if (active && boundWorkId && !busy && boundWorkId !== workId) c.setWorkId(boundWorkId);
  }, [active, boundWorkId, busy, workId]);

  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [state?.messages?.length, state?.partial]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (memoryOpen) memoryCloseBtnRef.current?.focus({ preventScroll: true });
  }, [memoryOpen]);

  const title = works.find(w => w.id === workId)?.title;
  const memoryDirty = Boolean(state && memory !== state.memory);
  const rawActivity = state?.activity ?? '';
  const activity = rawActivity.startsWith('Run ')
    ? (rawActivity.includes('reference_result') ? '正在等待并领取检索结果'
      : rawActivity.includes('reference_search') ? '正在提交参考检索'
      : rawActivity.includes('book_materials') ? '正在阅读本书大纲与设定'
      : rawActivity.includes('memory') ? '正在整理本书记忆'
      : rawActivity.includes('web_search') ? '正在查找网络资料'
      : '正在处理工具请求')
    : rawActivity;

  function requestCloseMemory() {
    if (memoryDirty) {
      setPendingConfirm('closeMemory');
    } else {
      setMemoryOpen(false);
      menuTriggerRef.current?.focus({ preventScroll: true });
    }
  }

  function requestReloadMemory() {
    if (memoryDirty) {
      setPendingConfirm('reloadMemory');
    } else if (workId) {
      void c.refreshState(workId, true);
    }
  }

  function handleWorkspaceKeyDown(event) {
    if (event.key !== 'Escape' || event.nativeEvent?.isComposing || event.isComposing || event.keyCode === 229) return;
    if (pendingConfirm) return;
    if (menuOpen) {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      menuTriggerRef.current?.focus({ preventScroll: true });
    } else if (memoryOpen) {
      event.preventDefault();
      event.stopPropagation();
      requestCloseMemory();
    }
  }

  const confirmConfig = pendingConfirm === 'reset'
    ? {
        title: '重新开始讨论？',
        message: '本书记忆保留，当前讨论记录清空。',
        confirmLabel: '重新开始',
        danger: true,
        onConfirm: () => {
          setPendingConfirm(null);
          c.reset();
        }
      }
    : pendingConfirm === 'reloadMemory'
      ? {
          title: '载入最新记忆？',
          message: '当前编辑框中有尚未保存的修改，载入最新记忆将覆盖这些未保存内容。',
          confirmLabel: '覆盖并载入',
          danger: true,
          onConfirm: () => {
            setPendingConfirm(null);
            if (workId) void c.refreshState(workId, true);
          }
        }
      : pendingConfirm === 'closeMemory'
        ? {
            title: '放弃未保存的修改？',
            message: '你有尚未保存的本书记忆修改，关闭面板将丢弃这些改动。',
            confirmLabel: '放弃并关闭',
            danger: true,
            onConfirm: () => {
              setPendingConfirm(null);
              if (state) c.setMemory(state.memory);
              setMemoryOpen(false);
              menuTriggerRef.current?.focus({ preventScroll: true });
            }
          }
        : null;

  const menuBlock = <div ref={menuRef} className="assistant-menu">
    <button ref={menuTriggerRef} type="button" className="icon-button assistant-menu-trigger"
      aria-label="更多助手操作" title="模型与记忆、重新开始讨论"
      aria-expanded={menuOpen} aria-haspopup="menu"
      onClick={() => setMenuOpen(open => !open)}>⋯</button>
    {menuOpen && <div className="assistant-menu-list" role="menu" aria-label="助手菜单">
      <button type="button" role="menuitem" onClick={() => {
        setMenuOpen(false);
        setMemoryOpen(true);
      }}>模型与记忆</button>
      <button type="button" role="menuitem" disabled={busy || !workId} onClick={() => {
        setMenuOpen(false);
        setPendingConfirm('reset');
      }}>重新开始讨论</button>
    </div>}
  </div>;

  return <section className={`assistant-workspace ${compact ? 'assistant-compact' : ''}`} aria-label="创作助手" onKeyDown={handleWorkspaceKeyDown}>
    <header className="assistant-header">
      {compact
        ? <h2 className="assistant-compact-title" title={title || '创作助手'}>{title || '创作助手'}</h2>
        : <h1>创作助手</h1>}
      <div className="assistant-header-actions">
        {!compact && <select aria-label="助手作品" value={workId} disabled={busy || Boolean(boundWorkId)} onChange={e => c.setWorkId(e.target.value)}>
          <option value="">选择一本原创作品</option>
          {works.map(w => <option key={w.id} value={w.id}>{w.title}</option>)}
        </select>}
        {menuBlock}
        {onClose && <button type="button" className="icon-button" aria-label="关闭助手侧栏" onClick={onClose}><Icon name="close" size={16} /></button>}
      </div>
    </header>
    {memoryOpen && <div className={`assistant-memory-layer ${compact ? 'is-compact' : 'is-drawer'}`}>
      {!compact && <div className="assistant-memory-backdrop" aria-hidden="true" onClick={requestCloseMemory} />}
      <section className="assistant-memory-panel" aria-label="模型与本书记忆">
        <header className="assistant-memory-head">
          <div className="assistant-memory-title">
            <h2>模型与本书记忆</h2>
            {memoryDirty && <span className="pill amber">未保存的修改</span>}
          </div>
          <button ref={memoryCloseBtnRef} type="button" className="icon-button" aria-label="关闭记忆面板" onClick={requestCloseMemory}><Icon name="close" size={16} /></button>
        </header>
        <div className="assistant-memory-body">
          <label>反重力模型<select aria-label="助手模型" value={modelId} disabled={busy} onChange={e => c.setModelId(e.target.value)}>
            {!models.length && <option value={modelId}>当前：{modelId}（刷新列表确认）</option>}
            {models.length > 0 && !models.some(m => m.id === modelId) && <option value={modelId}>当前：{modelId}（刷新列表确认）</option>}
            {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label>
          <button type="button" className="quiet assistant-refresh-models" disabled={busy} onClick={c.refreshModels}>刷新反重力模型</button>
          {state && <>
            <label className="assistant-memory-field"><span>本书任务与记忆</span>
              <textarea aria-label="本书助手记忆" value={memory} disabled={busy} onChange={e => c.setMemory(e.target.value)} />
            </label>
            <div className="assistant-actions">
              <button type="button" className="primary" disabled={busy} onClick={c.saveMemory}>保存记忆</button>
              <button type="button" disabled={busy} onClick={requestReloadMemory}>载入最新记忆</button>
            </div>
            <details className="assistant-memory-location"><summary>记忆文件位置</summary><code>{state.workspace}</code></details>
          </>}
        </div>
      </section>
    </div>}
    <ErrorMessage error={error} />
    {boundWorkId && workId && boundWorkId !== workId && <p className="assistant-notice">正在处理《{title}》的讨论。停止或完成后会切换到当前作品。</p>}
    <div className="assistant-scroll" ref={scroll} onScroll={e => {
      follow.current = e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 100;
    }}>
      {!state?.messages?.length && <div className="assistant-empty">
        <Icon name="book" size={28} />
        <h2>{workId ? '从一个情节问题开始' : '先选一本正在创作的书'}</h2>
        <p>结合本书大纲与设定，先找参考，再一起推敲人物的选择和情节的因果。</p>
        {workId && <button onClick={() => c.setText('这里想给男主设置一个困境，同时推进他与女主的关系。请结合本书设定给我几个方案，并说明参考依据。')}>试试：设计一个推动关系的困境</button>}
      </div>}
      <MessageList messages={state?.messages} />
      {busy && <div className="assistant-progress" role="status">
        <span className="assistant-pulse" />{activity || '正在连接与准备资料…'}
        {state?.retrievalJobs?.filter(j => j.status === 'running').map(j => <small key={j.id}>检索AI处理中 · {Math.round(j.elapsedMs / 1000)}秒</small>)}
      </div>}
      {busy && state?.partial && <article className="assistant-message">
        <div className="assistant-message-label">正在整理 · 尚未完成</div>
        <div className="assistant-prose"><Markdown>{state.partial}</Markdown></div>
      </article>}
      {state?.retrievalJobs?.filter(j => j.status === 'failed').map(j => <p key={j.id} className="assistant-notice danger">检索任务未完成：{j.error?.message ?? '请稍后重试'}</p>)}
      {state?.lastError && <p className="assistant-notice danger">本轮未完成：{state.lastError.message}</p>}
      {state?.failedPartial && <details className="assistant-details"><summary>查看本轮未完成的输出</summary><div className="assistant-prose"><Markdown>{state.failedPartial}</Markdown></div></details>}
      {state?.permissions?.map(p => <aside key={p.id} className="assistant-notice">
        <strong>{p.title}</strong>
        <pre>{JSON.stringify(p.input, null, 2)}</pre>
        {p.options.filter(o => o.kind !== 'allow_always').map(o => <button key={o.optionId} onClick={() => api('assistant.permission', { workId, id: p.id, optionId: o.optionId }).catch(c.setError)}>{o.name}</button>)}
        <button onClick={() => api('assistant.permission', { workId, id: p.id }).catch(c.setError)}>拒绝</button>
      </aside>)}
      {!!state?.sources && <details className="assistant-references">
        <summary>本轮参考资料 <span>{state.sources.hits?.length ?? 0} 条</span></summary>
        {state.sources.reason && <p>{state.sources.reason}</p>}
        {state.sources.hits?.map((card, i) => <Card key={i} card={card} compact collapseEvidence openCard={openCard} openEvidence={openEvidence} />)}
      </details>}
    </div>
    <footer className="assistant-composer">
      <textarea
        aria-label="助手问题"
        disabled={!workId}
        value={text}
        onChange={e => c.setText(e.target.value)}
        onKeyDown={e => {
          if (sendIntent(e) === 'send') {
            e.preventDefault();
            if (!busy) void c.run();
          }
        }}
        placeholder="描述想解决的情节，或接着推敲上一个方案…"
      />
      <div className="assistant-composer-actions">
        <span>Enter 发送 · Shift+Enter 换行</span>
        {busy
          ? <button type="button" onClick={c.stop}>停止</button>
          : <button type="button" className="primary" disabled={!workId || !text.trim()} onClick={c.run}>发送 <Icon name="send" size={15} /></button>}
      </div>
      <small className="assistant-privacy">主动发送后，相关创作资料交给所选模型；按需联网仅发送搜索词。</small>
    </footer>
    <ConfirmDialog
      open={Boolean(confirmConfig)}
      title={confirmConfig?.title ?? ''}
      message={confirmConfig?.message}
      confirmLabel={confirmConfig?.confirmLabel}
      danger={confirmConfig?.danger}
      onConfirm={() => confirmConfig?.onConfirm()}
      onCancel={() => setPendingConfirm(null)}
    />
  </section>;
}
