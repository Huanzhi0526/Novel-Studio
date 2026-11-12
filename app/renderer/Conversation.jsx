import React, { useEffect, useRef, useState } from 'react';
import { api, Card, categories, ErrorMessage, Icon } from './ui.jsx';

export function useConversation() {
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ workIds: [], categories: [] });
  const [useAi, setUseAi] = useState(false);
  const [messages, setMessages] = useState([]);
  const current = useRef(new Map());
  const [running, setRunning] = useState(false);

  async function run(message, cursor = null) {
    if (current.current.has(message.id)) return;
    const requestId = crypto.randomUUID();
    current.current.set(message.id, requestId);
    setRunning(true);
    setMessages(items => items.map(item => item.id === message.id ? { ...item, state: cursor ? 'more' : 'loading', error: null } : item));
    try {
      const result = await api('search.query', { query: message.query, ...message.filters, useAi: message.useAi, cursor, requestId, limit: 10 });
      if (current.current.get(message.id) !== requestId) return;
      setMessages(items => items.map(item => item.id === message.id ? {
        ...item, state: 'ready', result: {
          ...result, hits: cursor ? [...item.result.hits, ...result.hits] : result.hits
        }
      } : item));
    } catch (error) {
      if (current.current.get(message.id) !== requestId) return;
      setMessages(items => items.map(item => item.id === message.id ? {
        ...item, state: error.code === 'CANCELLED' ? 'cancelled' : 'error', error: error.code === 'CANCELLED' ? null : error
      } : item));
    } finally {
      if (current.current.get(message.id) === requestId) current.current.delete(message.id);
      setRunning(current.current.size > 0);
    }
  }

  function submit(event) {
    event.preventDefault();
    const query = draft.trim();
    if (!query || current.current.size) return;
    const message = { id: crypto.randomUUID(), query, filters, useAi, state: 'loading' };
    setMessages(items => [...items, message]);
    setDraft('');
    void run(message);
  }

  function cancel(message) {
    const id = current.current.get(message.id);
    if (id) void api('request.cancel', { id }).catch(() => {});
  }

  function clear() {
    for (const id of current.current.values()) void api('request.cancel', { id }).catch(() => {});
    current.current.clear();
    setRunning(false);
    setMessages([]);
  }

  return { draft, setDraft, filters, setFilters, useAi, setUseAi, messages, running, submit, run, cancel, clear };
}

export function Conversation({ state, works, openEvidence, openCard, sidebar = false, close, onSettings }) {
  const list = useRef(null);
  const lastExchange = useRef(null);
  const anchor = useRef({ id: null, ready: false });
  const { draft, setDraft, filters, setFilters, useAi, setUseAi, messages, running, submit, run, cancel, clear } = state;
  const latest = messages.at(-1);
  useEffect(() => {
    const current = { id: latest?.id ?? null, ready: latest?.state === 'ready' };
    if (!list.current || !lastExchange.current) return;
    if (anchor.current.id === current.id && (anchor.current.ready || !current.ready)) return;
    const container = list.current.getBoundingClientRect();
    const message = lastExchange.current.getBoundingClientRect();
    list.current.scrollTop += message.top - container.top - 14;
    anchor.current = current;
  }, [latest?.id, latest?.state]);

  return <section className={`conversation ${sidebar ? 'conversation-sidebar' : ''}`} aria-label={sidebar ? '参考检索侧栏' : '参考库检索'}>
    <header className="conversation-head">
      <div className="conversation-heading"><h2>{sidebar ? '参考检索' : '查找知识卡'}</h2>
        {!sidebar && <span>{works.filter(work => work.deleted == null).length} 部参考作品</span>}</div>
      <div className="button-row">
        {messages.length > 0 && <button type="button" className="quiet" onClick={clear}>清空</button>}
        {close && <button type="button" className="icon-button" onClick={close} aria-label="收起参考检索"><Icon name="close" size={16} /></button>}
      </div>
    </header>
    <div className="conversation-scope">
      <label><span>作品</span><select aria-label="筛选参考作品" value={filters.workIds[0] ?? ''}
        onChange={event => setFilters({ ...filters, workIds: event.target.value ? [event.target.value] : [] })}>
        <option value="">全部作品</option>
        {works.filter(work => work.deleted == null).map(work => <option key={work.work_id} value={work.work_id}>{work.title}</option>)}
      </select></label>
      <label><span>类别</span><select aria-label="筛选卡片类别" value={filters.categories[0] ?? ''}
        onChange={event => setFilters({ ...filters, categories: event.target.value ? [event.target.value] : [] })}>
        <option value="">全部类别</option>
        {Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
    </div>
    <div className="messages" ref={list} aria-live="polite">
      {!messages.length && <div className="conversation-empty">
        <div className="empty-emblem"><Icon name="search" size={26} /></div>
        <h3>从故事里找参考</h3>
        <p>描述想找的人物、情节或设定。</p>
        {!sidebar && <div className="query-examples">
          {['有哪些大小姐人设？', '有哪些装逼（打脸）的情节？', '有哪些能力需要付出代价？'].map(query =>
            <button type="button" key={query} onClick={() => {
              setDraft(query);
              document.getElementById('library-query')?.focus();
            }}>{query}<Icon name="arrow" size={13} /></button>)}
        </div>}
      </div>}
      {messages.map(message => <div key={message.id} ref={message.id === latest?.id ? lastExchange : null} className="exchange">
        <div className="user-message">{message.query}</div>
        <div className="result-message">
          <div className="result-label">参考库</div>
          {message.state === 'loading' && <div className="inline-status"><span className="spinner" /> 正在检索 <button className="quiet" onClick={() => cancel(message)}>取消</button></div>}
          {message.state === 'cancelled' && <div className="notice">已取消检索 <button className="quiet" onClick={() => run(message)}>重试</button></div>}
          <ErrorMessage error={message.error} />
          {message.state === 'error' && <button className="quiet" onClick={() => run(message)}>重试</button>}
          {message.result?.reason && <p className="notice mini">{message.result.reason}</p>}
          {message.result && !message.result.hits.length && <p className="notice">没有找到匹配的知识卡。</p>}
          {message.result?.hits.map(card => <Card key={`${card.work_id}/${card.card_id}`} card={card} compact openEvidence={openEvidence} openCard={openCard} />)}
          {message.result?.cursor && <button className="quiet" disabled={message.state === 'more'} onClick={() => run(message, message.result.cursor)}>
            {message.state === 'more' ? '正在加载…' : '加载更多'}
          </button>}
          {message.state === 'more' && <button className="quiet" onClick={() => cancel(message)}>取消</button>}
        </div>
      </div>)}
    </div>
    <form className="search-composer" onSubmit={submit}>
      <label className="sr-only" htmlFor={sidebar ? 'sidebar-query' : 'library-query'}>检索问题</label>
      <textarea id={sidebar ? 'sidebar-query' : 'library-query'} placeholder="描述你想找的人物、情节或设定…" maxLength={500} rows={2}
        value={draft} onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault();
            event.currentTarget.form.requestSubmit();
          }
        }} />
      <div className="composer-foot">
        <label className="retrieval-toggle"><input type="checkbox" checked={useAi} onChange={event => setUseAi(event.target.checked)} />
          <span>外部 AI 辅助</span></label>
        <div className="composer-actions">
          {onSettings && <button type="button" className="quiet retrieval-settings-link" onClick={onSettings}><Icon name="settings" size={14} />接口设置</button>}
          <button type="submit" className="send-button" aria-label="检索" disabled={!draft.trim() || running}><Icon name="send" size={17} /></button>
        </div>
      </div>
      {useAi && <small className="retrieval-disclosure">问题和候选卡摘录将发送到所配服务。</small>}
    </form>
  </section>;
}
