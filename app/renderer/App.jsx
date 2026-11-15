import { Assistant, useAssistantController } from './Assistant.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, ErrorMessage, Icon } from './ui.jsx';
import { RetrievalPreferences } from './RetrievalPreferences.jsx';
import { Conversation, useConversation } from './Conversation.jsx';
import { CardEditor, Reader, Reference } from './Reference.jsx';
import { Writing, flushWriting } from './Writing.jsx';
import { clearWritingSession, readWritingSession, writeWritingSession } from './writing-session.mjs';
import {
  AppearancePreferences, ExpansionPreferences, loadPreferences, normalizePreferences, ReaderSizePreference,
  savePreferences, WritingPreferences, writingSurface
} from './Preferences.jsx';
import './app.css';
import './workspace-settings.css';

function Settings({ info, restored, preferences, updatePreferences, settingsTarget, onOpenAssistant }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [group, setGroup] = useState('appearance');
  const groups = [
    ['appearance', '外观与阅读', 'settings'],
    ['writing', '写作偏好', 'edit'],
    ['retrieval', 'AI 辅助检索', 'search'],
    ['expansion', 'AI 扩写', 'sparkPen'],
    ['data', '本机资料', 'library'],
    ['assistant', '创作助手', 'chat']
  ];

  useEffect(() => {
    if (settingsTarget) setGroup(settingsTarget === 'retrieval-settings' ? 'retrieval' : 'expansion');
  }, [settingsTarget]);

  async function run(action, requestId = '') {
    setBusy(requestId || action);
    setError(null);
    setMessage('');
    try {
      if (action.startsWith('backup.')) await flushWriting();
      const result = await api(action, requestId ? { requestId } : {});
      if (action === 'backup.export' && result) setMessage(`备份已保存至 ${result.filename}`);
      if (action === 'backup.restore' && result) {
        await restored();
        setMessage(`恢复完成。恢复前快照位于 ${result.previous}`);
      }
      if (action === 'search.prepare') setMessage(`语义索引已就绪，本次构建 ${result.indexed} 张知识卡。`);
    } catch (failure) {
      if (failure.code !== 'CANCELLED') setError(failure);
      else setMessage('已取消。已写入的向量可以在下次构建时复用。');
    } finally { setBusy(''); }
  }

  return <div className="settings-page">
    <header className="settings-title"><h1>资料与设置</h1><p>按用途管理写作环境、模型与本机资料。</p></header>
    <div className="settings-layout">
    <nav className="settings-nav" aria-label="设置分类">
      {groups.map(([id, label, icon]) => <button key={id} type="button"
        aria-current={group === id ? 'page' : undefined} onClick={() => setGroup(id)}>
        <Icon name={icon} size={16} />{label}
      </button>)}
    </nav>
    <div className="settings-panel">
    <ErrorMessage error={error} />
    {message && <p className="notice success" role="status">{message}</p>}
    <div className="settings-group" hidden={group !== 'appearance'}>
    <section className="settings-preferences" aria-labelledby="appearance-settings">
      <h2 id="appearance-settings">外观</h2>
      <AppearancePreferences preferences={preferences} update={updatePreferences} />
    </section>
    <section className="setting-card">
      <div><h2>阅读字号</h2><p>应用于参考作品原文。</p></div>
      <ReaderSizePreference preferences={preferences} update={updatePreferences} />
    </section>
    </div>
    <div className="settings-group" hidden={group !== 'writing'}>
    <section className="settings-preferences" aria-labelledby="writing-settings">
      <h2 id="writing-settings">写作偏好</h2>
      <WritingPreferences preferences={preferences} update={updatePreferences} preview />
    </section>
    </div>
    <div className="settings-group" hidden={group !== 'expansion'}>
    <RetrievalPreferences purpose="expand" />
    </div>
    <div className="settings-group" hidden={group !== 'retrieval'}>
    <RetrievalPreferences kbV2={info?.kbV2} />
    </div>
    <div className="settings-group" hidden={group !== 'data'}>
    <header className="settings-data-title"><h2>本机资料</h2><p>管理存储位置、备份与本地检索索引。</p></header>
    <section className="setting-card">
      <div><h2>资料目录</h2><p>{info?.dataDir}</p></div>
      <button onClick={() => run('app.openDataDir')} disabled={Boolean(busy)}>打开资料目录 ↗</button>
    </section>
    <section className="setting-card">
      <div><h2>备份与恢复</h2><p>备份包含原创、历史、标记、参考正文、插图和知识卡。恢复时保留当前资料的快照。{info?.kbV2 && '新版备份同时包含独立参考库；恢复旧版备份只恢复原创与旧资料，不替换新版参考库。'}</p></div>
      <div className="button-row">
        <button onClick={() => run('backup.export')} disabled={Boolean(busy)}>导出备份</button>
        <button onClick={() => run('backup.restore')} disabled={Boolean(busy)}>恢复备份</button>
      </div>
    </section>
    <section className="setting-card">
      <div><h2>本地语义索引</h2><p>{info?.modelConfigured ? info.model.split(':')[0] : '当前可用关键词检索。将本地模型包解压到资料目录，保留 model 文件夹，然后重启应用。'}</p></div>
      <div className="button-row">
        <button onClick={() => run('search.prepare', crypto.randomUUID())} disabled={Boolean(busy) || !info?.modelConfigured}>构建索引</button>
        {busy.length === 36 && <button onClick={() => api('request.cancel', { id: busy })}>取消</button>}
      </div>
    </section>
    </div>
    <div className="settings-group" hidden={group !== 'assistant'}>
    <section className="settings-preferences" aria-labelledby="assistant-settings-heading">
      <h2 id="assistant-settings-heading">创作助手</h2>
      <p className="settings-assistant-note">助手模型按每本书在创作助手页选择，本机记忆与对话记录也按作品各自保存。</p>
      <div className="button-row">
        <button type="button" className="primary" onClick={onOpenAssistant}>打开创作助手</button>
      </div>
    </section>
    </div>
    {busy && <div className="inline-status" role="status"><span className="spinner" />正在处理…</div>}
    </div>
    </div>
  </div>;
}

const INITIAL_REFERENCE_VIEW = { mode: 'search', selected: '', archiveOpen: false, query: '' };

function useResolvedAppearance(appearance) {
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );

  useEffect(() => {
    if (appearance !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [appearance]);

  return appearance === 'system' ? (systemDark ? 'dark' : 'light') : appearance;
}

function App() {
  const [view, setView] = useState('writing');
  const [settingsTarget, setSettingsTarget] = useState(null);
  const [focused, setFocused] = useState(false);
  const [works, setWorks] = useState([]);
  const [info, setInfo] = useState(null);
  const [card, setCard] = useState(null);
  const [reader, setReader] = useState(null);
  const readerTrigger = useRef(null);
  const [epoch, setEpoch] = useState(0);
  const [railTarget, setRailTarget] = useState(null);
  const [railCollapsed, setRailCollapsed] = useState(() => readWritingSession().layout.railCollapsed);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState('');
  const [preferences, setPreferences] = useState(loadPreferences);
  const resolvedAppearance = useResolvedAppearance(preferences.appearance);
  const [referenceView, setReferenceView] = useState(INITIAL_REFERENCE_VIEW);
  const referenceShelfScroll = useRef(0);
  const assistantController = useAssistantController();
  const writingChat = useConversation();
  const libraryChat = useConversation();

  async function refresh() {
    const value = await api('reference.list');
    setWorks(value.works);
  }

  useEffect(() => {
    refresh().catch(setError);
    api('app.info').then(setInfo).catch(setError);
    return window.studio.onCloseRequested(async () => {
      try {
        await flushWriting();
        await api('app.closeResult', { saved: true });
      } catch (failure) {
        await api('app.closeResult', { saved: false, message: failure.message }).catch(() => {});
      }
    });
  }, []);

  useEffect(() => savePreferences(preferences), [preferences]);
  useEffect(() => {
    document.documentElement.style.colorScheme = resolvedAppearance;
    document.documentElement.style.backgroundColor=resolvedAppearance==='dark'?'#14191f':'#ffffff';
    void api('app.appearance',{appearance:preferences.appearance}).catch(()=>{});
  }, [resolvedAppearance,preferences.appearance]);

  function updatePreferences(patch) {
    setPreferences(current => normalizePreferences({ ...current, ...patch }));
  }

  function toggleRail() {
    setRailCollapsed(current => {
      const next = !current;
      const session = readWritingSession();
      writeWritingSession({ ...session, layout: { ...session.layout, railCollapsed: next } });
      return next;
    });
  }

  async function changeView(next, target = null) {
    try {
      setError(null);
      if (view === 'writing' && next !== view) await flushWriting();
      setSettingsTarget(target);
      setView(next);
    } catch (failure) { setError(failure); }
  }

  function openReader(position) {
    readerTrigger.current = document.activeElement;
    setReader(position);
  }

  function closeReader() {
    const trigger = readerTrigger.current;
    setReader(null);
    requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); });
  }

  function openEvidence(item, range) {
    openReader({
      workId: item.work_id, volumeId: range.volume_id, revisionId: range.revision_id,
      start: range.start, end: range.end
    });
  }

  const tabs = [
    ['writing', '原创写作', 'edit'],
    ['reference', '参考库', 'library'],
    ['assistant', '创作助手', 'chat'],
    ['settings', '资料与设置', 'settings']
  ];
  const reading = Boolean(reader);
  const railLabel = railCollapsed ? '展开侧栏' : '收起侧栏';
  return <div className={`studio ${railCollapsed ? 'studio-rail-collapsed' : ''} ${reading || (view === 'writing' && focused) ? 'studio-focused' : ''}`}
    data-theme={preferences.theme} data-appearance={resolvedAppearance}
    style={{ '--reader-font': `${preferences.readerSize}px` }}>
    <aside className="app-rail" hidden={reading}>
      <div className="brand" title="小说工作台"><span className="brand-mark"><Icon name="book" size={19} /></span><strong>小说工作台</strong></div>
      <nav className="topnav" aria-label="主导航">
        {tabs.map(([key, label, icon]) =>
          <button type="button" key={key} aria-label={label} title={label} aria-current={view === key ? 'page' : undefined} onClick={() => changeView(key)}>
            <Icon name={icon} size={16} /><span>{label}</span>
          </button>
        )}
      </nav>
      <div ref={setRailTarget} className="app-rail-content" hidden={view !== 'writing'} />
      <footer className="app-rail-footer">
        <div className="rail-footer-meta">
          <span className="local-status"><i />本机资料库</span>
          <span className="app-version">{info ? `v${info.version}` : ''}</span>
        </div>
        <button type="button" className="rail-toggle" aria-label={railLabel} title={railLabel}
          aria-expanded={!railCollapsed} onClick={toggleRail}>
          <Icon name="panel" size={15} /><span>{railLabel}</span>
        </button>
      </footer>
    </aside>
    <div className="studio-content" hidden={reading}>
      <ErrorMessage error={error} />
      {banner && <div className="notice"><span>{banner}</span><button className="quiet" onClick={() => setBanner('')}>关闭</button></div>}
      <main className="workspace-main" hidden={view !== 'writing'} {...writingSurface(preferences)}>
        <Writing key={epoch} api={api} setFocused={setFocused} railTarget={view === 'writing' ? railTarget : null}
          preferences={preferences} updatePreferences={updatePreferences}
          renderAssistant={(close,workId)=><Assistant active={view==='writing'} controller={assistantController} compact boundWorkId={workId} onClose={close} openCard={setCard} openEvidence={openEvidence}/>}
          onExpansionSettings={() => changeView('settings', 'expansion-settings')}
          renderReference={close => <Conversation sidebar state={writingChat} works={works} close={close} kbV2={Boolean(info?.kbV2)}
            openCard={setCard} openEvidence={openEvidence} onSettings={() => changeView('settings', 'retrieval-settings')} />} />
      </main>
      {view === 'reference' && <main className="workspace-main">
        <Reference works={works} refresh={refresh} conversation={libraryChat} openCard={setCard} openEvidence={openEvidence} openReader={openReader}
          kbV2={Boolean(info?.kbV2)} onSettings={() => changeView('settings', 'retrieval-settings')}
          viewState={referenceView} setViewState={setReferenceView} shelfScroll={referenceShelfScroll} />
      </main>}
      <main className="workspace-main" hidden={view !== 'assistant'}><Assistant controller={assistantController} active={view === 'assistant'} openCard={setCard} openEvidence={openEvidence} /></main>
      {view === 'settings' && <main className="workspace-main settings-main">
        <Settings info={info} preferences={preferences} updatePreferences={updatePreferences} settingsTarget={settingsTarget}
          onOpenAssistant={() => changeView('assistant')} restored={async () => {
          writingChat.clear();
          libraryChat.clear();
          setReferenceView(INITIAL_REFERENCE_VIEW);
          referenceShelfScroll.current = 0;
          clearWritingSession();
          setRailCollapsed(false);
          setEpoch(value => value + 1);
          await refresh();
        }} />
      </main>}
    </div>
    {card && <div hidden={reading}>
      <CardEditor card={card} works={works} editable={!info?.kbV2} close={() => setCard(null)} openEvidence={openEvidence} onSaved={warnings => {
        setCard(null);
        setBanner(warnings.join(' '));
        refresh().catch(setError);
      }} />
    </div>}
    {reader && <Reader initial={reader} works={works} close={closeReader}
      sizeControl={<ReaderSizePreference preferences={preferences} update={updatePreferences} />} />}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
