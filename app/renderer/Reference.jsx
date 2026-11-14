import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, Card, categories, ErrorMessage, Icon, Modal, PageHeader, structureTypes } from './ui.jsx';
import { Conversation } from './Conversation.jsx';
import { BookCover } from './BookCover.jsx';
import './reference-bookshelf.css';
import './reader-workspace.css';

function coordinates(work, volume, revision) {
  return { workId: work.work_id, volumeId: volume.volume_id, revisionId: revision.revision_id };
}

function revisionLabel(revision, index) {
  if (index === 0) return '当前版本';
  const date = revision.imported ? new Date(revision.imported).toLocaleString('zh-CN', { hour12: false }) : '';
  return `归档版本 ${index}${date ? ` · ${date}` : ''}`;
}

export function Reference({
  works, refresh, conversation, openCard, openEvidence, openReader, onSettings, kbV2 = false,
  viewState, setViewState, shelfScroll
}) {
  const [localView, setLocalView] = useState({ mode: 'search', selected: '', archiveOpen: false, query: '' });
  const currentView = viewState ?? localView;
  const updateView = setViewState ?? setLocalView;
  const { mode, selected, archiveOpen, query } = currentView;
  const setMode = mode => updateView(current => ({ ...current, mode }));
  const setSelected = selected => updateView(current => ({ ...current, selected }));
  const [listing, setListing] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [notice, setNotice] = useState('');
  const shelfBody = useRef(null);
  const localShelfScroll = useRef(0);
  const scrollRef = shelfScroll ?? localShelfScroll;
  const workHeading = useRef(null);
  const returnPosition = useRef(null);
  const work = works.find(item => item.work_id === selected);
  const workId = work?.work_id;
  const cardPage = listing?.workId === workId ? listing : null;
  const titleQuery = query.trim().toLocaleLowerCase();
  const archivedCount = works.filter(item => item.deleted != null).length;
  const shelfWorks = works.filter(item => (item.deleted != null) === archiveOpen);
  const visibleWorks = shelfWorks.filter(item => item.title.toLocaleLowerCase().includes(titleQuery));

  useLayoutEffect(() => {
    if (mode !== 'shelf') return;
    const body = shelfBody.current;
    if (!body) return;
    if (workId) {
      body.scrollTop = 0;
      workHeading.current?.focus({ preventScroll: true });
    } else if (returnPosition.current) {
      const { id, top } = returnPosition.current;
      returnPosition.current = null;
      scrollRef.current = top;
      body.scrollTop = top;
      body.querySelector(`[data-reference-work="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    } else {
      body.scrollTop = scrollRef.current;
    }
  }, [mode, workId]);

  useEffect(() => {
    let alive = true;
    setListing(null);
    if (work && work.deleted == null && mode === 'shelf') {
      api('reference.listCards', { workId: work.work_id }).then(value => {
        if (alive) setListing({ ...value, workId: work.work_id });
      }).catch(failure => { if (alive) setError(failure); });
    }
    return () => { alive = false; };
  }, [work, mode]);

  function browseWork(id) {
    const top = shelfBody.current?.scrollTop ?? 0;
    scrollRef.current = top;
    returnPosition.current = { id, top };
    setError(null);
    setSelected(id);
  }

  function returnToShelf() {
    setError(null);
    setSelected('');
  }

  async function more() {
    if (!cardPage || cardPage.next == null || cardPage.loading) return;
    const pending = { ...cardPage, loading: true, error: null };
    setListing(pending);
    try {
      const value = await api('reference.listCards', { workId, offset: cardPage.next });
      setListing(current => current === pending
        ? { ...value, workId, cards: [...cardPage.cards, ...value.cards] }
        : current);
    } catch (failure) {
      setListing(current => current === pending ? { ...cardPage, error: failure } : current);
    }
  }

  async function setHidden(hidden) {
    try {
      await api('reference.setHidden', { workId: work.work_id, hidden });
      setConfirmHide(false);
      await refresh();
      returnToShelf();
    } catch (failure) { setError(failure); }
  }

  return <div className="reference-page">
    <PageHeader title="参考库" className="reference-toolbar" actions={<>
      <div className="segmented" role="group" aria-label="参考库页面">
        <button type="button" aria-pressed={mode === 'search'} onClick={() => setMode('search')}>检索</button>
        <button type="button" aria-pressed={mode === 'shelf'} onClick={() => {
          if (mode === 'shelf' && work) returnToShelf();
          setMode('shelf');
        }}>书架</button>
      </div>
      {!kbV2 && <button type="button" className="reference-import" onClick={() => setImporting(true)}><Icon name="plus" size={15} />导入标准结果包</button>}
    </>} />
    <ErrorMessage error={error} />
    {notice && <div className="notice success">{notice}<button className="quiet" onClick={() => setNotice('')}>关闭</button></div>}
    {mode === 'search'
      ? <Conversation state={conversation} works={works} openEvidence={openEvidence} openCard={openCard} onSettings={onSettings} kbV2={kbV2} />
      : <div ref={shelfBody} className="reference-shelf-scroll" onScroll={event => {
        if (!workId) scrollRef.current = event.currentTarget.scrollTop;
      }}>
        {work ? <section className="reference-shelf-pane" aria-labelledby="reference-work-title">
          <button className="reference-shelf-back" type="button" onClick={returnToShelf}>
            <span aria-hidden="true">‹</span>返回书架
          </button>
          <header className="reference-work-heading">
            <div className="reference-work-cover"><BookCover title={work.title} cover={work.cover} /></div>
            <div>
            <div className="eyebrow">{work.deleted ? '封存作品' : '参考作品'}</div>
              <h2 id="reference-work-title" tabIndex={-1} ref={workHeading}>{work.title}</h2>
              <p>{work.volumes.length} 卷{work.deleted ? ' · 已隐藏' : ''}</p>
            </div>
            <button type="button" className="quiet" onClick={() => work.deleted ? setHidden(false) : setConfirmHide(true)}>
              {work.deleted ? '恢复到参考库' : '封存作品'}
            </button>
          </header>
          {work.deleted ? <p className="muted">此作品已退出检索。恢复后可查看知识卡和原文。</p> : <>
          <h3>原文卷册</h3>
          {work.volumes.length === 0 && <p className="muted">该作品还没有可阅读的卷册。</p>}
          <div className="reference-volume-grid">
            {work.volumes.map(volume => {
              const [latest, ...archived] = volume.revisions;
              return <article className="reference-volume-tile" key={volume.volume_id}>
                <div><strong>{volume.title}</strong></div>
                {latest ? <button type="button" onClick={() => openReader(coordinates(work, volume, latest))}>开始阅读</button>
                  : <small>暂无可阅读的原文</small>}
                {archived.length > 0 && <details className="reference-volume-archive">
                  <summary>历史版本</summary>
                  {archived.map((revision, index) => <button type="button" key={revision.revision_id}
                    onClick={() => openReader(coordinates(work, volume, revision))}>{revisionLabel(revision, index + 1)}</button>)}
                </details>}
              </article>;
            })}
          </div>
          <h3>知识卡</h3>
          {!cardPage && !error && <p className="muted" role="status">正在读取知识卡…</p>}
          {cardPage?.cards.length === 0 && <p className="muted">该作品还没有知识卡。</p>}
          {cardPage?.cards.map(card => <Card key={card.card_id} card={card} openCard={openCard} openEvidence={openEvidence} />)}
          <ErrorMessage error={cardPage?.error} />
          {cardPage?.next != null && <button type="button" disabled={cardPage.loading} onClick={more}>
            {cardPage.loading ? '正在加载…' : '加载更多'}
          </button>}
          </>}
        </section> : <section className="reference-shelf-pane" aria-labelledby="reference-shelf-title">
          <header className="reference-shelf-heading">
            <div>
              <div className="eyebrow">{archiveOpen ? '已封存作品' : '在用作品'} · {shelfWorks.length}</div>
              <h2 id="reference-shelf-title">{archiveOpen ? '参考封存' : '参考书架'}</h2>
            </div>
            <div className="reference-shelf-tools">
              {shelfWorks.length > 0 && <label className="reference-shelf-filter">
                <Icon name="search" size={16} />
                <input type="search" aria-label="搜索参考作品" placeholder="搜索书名" value={query}
                  onChange={event => {
                    const value = event.target.value;
                    updateView(current => ({ ...current, query: value }));
                  }} />
              </label>}
              {(archivedCount > 0 || archiveOpen) && <button type="button" className="quiet" onClick={() => {
                scrollRef.current = 0;
                updateView(current => ({ ...current, archiveOpen: !current.archiveOpen, query: '' }));
              }}>{archiveOpen ? '返回参考书架' : `封存书目（${archivedCount}）`}</button>}
            </div>
          </header>
          {shelfWorks.length === 0 ? <div className="conversation-empty">
            <h3>{archiveOpen ? '暂无封存书目' : '参考书架还空着'}</h3>
            {!archiveOpen && <p>导入外部 Agent 交付的标准结果 ZIP，审核通过后即可阅读和检索。</p>}
          </div> : visibleWorks.length === 0 ? <p className="reference-shelf-empty muted" role="status">没有找到符合条件的作品。</p>
            : <div className="reference-bookshelf-grid">
              {visibleWorks.map(item => <button key={item.work_id} type="button" className="reference-book-card"
                data-reference-work={item.work_id} title={item.title} onClick={() => browseWork(item.work_id)}>
                <div className="reference-book-cover"><BookCover title={item.title} cover={item.cover} /></div>
                <strong>{item.title}</strong>
                <small>{item.volumes.length} 卷</small>
              </button>)}
            </div>}
        </section>}
      </div>}
    {confirmHide && <Modal title="封存参考作品" close={() => setConfirmHide(false)}>
      <p>《{work?.title}》将退出检索和参考书架。可在封存书目中恢复。</p>
      <div className="button-row align-right">
        <button onClick={() => setConfirmHide(false)}>取消</button>
        <button className="primary" onClick={() => setHidden(true)}>确认封存</button>
      </div>
    </Modal>}
    {importing && <ImportDialog works={works} close={() => setImporting(false)} onCommitted={async stats => {
      await refresh();
      setNotice(`已入库。新增 ${stats.cardsAdded} 张，更新 ${stats.cardsUpdated} 张，保留 ${stats.cardsKept} 张，跳过 ${stats.cardsSkipped} 张。`);
      setImporting(false);
      returnPosition.current = null;
      scrollRef.current = 0;
      if (shelfBody.current) shelfBody.current.scrollTop = 0;
      updateView(current => ({ ...current, selected: '', query: '', mode: 'shelf' }));
    }} />}
  </div>;
}

function rawRange({ volume_id, revision_id, start, end }) {
  return { volume_id, revision_id, start, end };
}

function EvidenceFields({ range, volumes, onChange, remove }) {
  const volume = volumes.find(item => item.volume_id === range.volume_id);
  return <div className="evidence-field">
    <label>分卷<select value={range.volume_id} onChange={event => {
      const next = volumes.find(item => item.volume_id === event.target.value);
      onChange({ ...range, volume_id: next.volume_id, revision_id: next.revisions[0]?.revision_id ?? '' });
    }}>
      {volumes.map(item => <option key={item.volume_id} value={item.volume_id}>{item.title}</option>)}
    </select></label>
    <label>版本<select value={range.revision_id} onChange={event => onChange({ ...range, revision_id: event.target.value })}>
      {volume?.revisions.map(item => <option key={item.revision_id} value={item.revision_id}>{item.revision_id.slice(0, 12)} · {item.count} 段</option>)}
    </select></label>
    <label>起始段<input value={range.start} onChange={event => onChange({ ...range, start: event.target.value })} required /></label>
    <label>结束段<input value={range.end} onChange={event => onChange({ ...range, end: event.target.value })} required /></label>
    <button type="button" className="quiet" onClick={remove} disabled={!remove}>移除</button>
  </div>;
}

function CardForm({ initial, volumes, submit, button = '保存知识卡', cancel }) {
  const [form, setForm] = useState(() => ({
    card_id: initial.card_id, category: initial.category, title: initial.title, content: initial.content,
    claim_type: initial.claim_type, evidence: initial.evidence.map(rawRange),
    aliases: (initial.aliases ?? []).join('、'), related_card_ids: initial.related_card_ids ?? []
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const update = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const latest = volumes[0]?.revisions[0];
  return <form className="card-form" onSubmit={async event => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const aliases = initial.aliases ?? [];
      await submit({ ...form, aliases: form.aliases === aliases.join('、')
        ? aliases : form.aliases.split(/[、,，\n]/).map(value => value.trim()).filter(Boolean) });
    } catch (failure) { setError(failure); }
    finally { setSaving(false); }
  }}>
    <ErrorMessage error={error} />
    <label>标题<input value={form.title} required onChange={event => update('title', event.target.value)} /></label>
    <div className="form-row">
      <label>类别<select value={form.category} onChange={event => update('category', event.target.value)}>
        {Object.entries(categories).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
      </select></label>
      <label>性质<select value={form.claim_type} onChange={event => update('claim_type', event.target.value)}>
        <option value="fact">原文事实</option><option value="interpretation">分析推断</option>
      </select></label>
    </div>
    <label>内容<textarea aria-label="内容" rows={6} value={form.content} onChange={event => update('content', event.target.value)} required /></label>
    <label>别名<input value={form.aliases} onChange={event => update('aliases', event.target.value)} placeholder="用顿号分隔" /></label>
    <div className="heading-row"><strong>原文证据</strong><button type="button" className="quiet" disabled={!latest} onClick={() => update('evidence', [...form.evidence, {
      volume_id: volumes[0].volume_id, revision_id: latest.revision_id, start: 'p000001', end: 'p000001'
    }])}>＋ 添加证据</button></div>
    {form.evidence.map((range, index) => <EvidenceFields key={index} range={range} volumes={volumes}
      onChange={value => update('evidence', form.evidence.map((item, i) => i === index ? value : item))}
      remove={form.evidence.length > 1 ? () => update('evidence', form.evidence.filter((_, i) => i !== index)) : undefined} />)}
    <div className="button-row align-right">
      {cancel && <button type="button" onClick={cancel} disabled={saving}>取消编辑</button>}
      <button type="submit" className="primary" disabled={saving}>{saving ? '保存中…' : button}</button>
    </div>
  </form>;
}

export function CardEditor({ card, works, close, openEvidence, onSaved, editable = true }) {
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const volumes = works.find(work => work.work_id === card.work_id)?.volumes ?? [];
  useEffect(() => {
    let alive = true;
    setLive(null);
    setError(null);
    setEditing(false);
    api('reference.getCard', { workId: card.work_id, cardId: card.card_id })
      .then(value => { if (alive) setLive(value); })
      .catch(failure => { if (alive) setError(failure); });
    return () => { alive = false; };
  }, [card]);
  const categoryLabel = live?.v2_badge ?? categories[live?.category ?? card.category];
  const eyebrow = [live?.work_title ?? card.work_title, categoryLabel].filter(Boolean).join(' · ');
  const dialogTitle = editing ? '编辑知识卡' : (live?.title ?? card.title ?? '知识卡');
  return <Modal title={dialogTitle} eyebrow={eyebrow} close={close} wide
    className={editing ? '' : 'card-reader'}
    actions={editable && !editing && live && <button type="button" className="quiet" onClick={() => setEditing(true)}><Icon name="edit" size={15} />编辑</button>}>
    <ErrorMessage error={error} />
    {live ? editing && editable
      ? <CardForm key={live.revision} initial={live} volumes={volumes} cancel={() => setEditing(false)} submit={async edited => {
        const value = await api('reference.editCard', { workId: live.work_id, expectedRevision: live.revision, card: edited });
        onSaved(value.warnings);
      }} />
      : <>
        <Card card={live} openEvidence={openEvidence} collapseEvidence headless />
        {!editable && <p className="muted card-readonly-note">此卡由参考库建库流程维护，在此只读。</p>}
      </>
      : !error && <p className="inline-status"><span className="spinner" />正在读取</p>}
  </Modal>;
}

function ImportDialog({ works, close, onCommitted }) {
  const [requestId] = useState(() => crypto.randomUUID());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [resolutions, setResolutions] = useState({});
  const [keepAll, setKeepAll] = useState(false);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    let alive = true;
    api('import.inspect', { requestId }).then(value => {
      if (!alive) return;
      if (!value) close();
      else setData(value);
    }).catch(failure => { if (alive && failure.code !== 'CANCELLED') setError(failure); });
    return () => {
      alive = false;
      void api('request.cancel', { id: requestId }).catch(() => {});
    };
  }, []);

  const volumes = new Map((works.find(work => work.work_id === data?.work?.work_id)?.volumes ?? [])
    .map(volume => [volume.volume_id, volume]));
  for (const volume of data?.volumes ?? []) {
    const prior = volumes.get(volume.volume_id);
    volumes.set(volume.volume_id, {
      ...volume, revisions: [volume, ...(prior?.revisions ?? []).filter(item => item.revision_id !== volume.revision_id)]
    });
  }
  function cancel() {
    if (saving) return;
    if (data?.id) void api('import.cancel', { id: data.id }).catch(() => {});
    close();
  }
  function setResolution(id, value) {
    setResolutions(current => ({ ...current, [id]: value }));
  }
  return <Modal title="审核标准结果包" eyebrow="参考资料导入" close={cancel} wide>
    <ErrorMessage error={error} />
    {!data && !error && <div className="inline-status"><span className="spinner" />选择并校验结果 ZIP <button className="quiet" onClick={cancel}>取消</button></div>}
    {data?.status === 'duplicate' && <div className="notice success">该结果包已经导入。现有知识卡保持原有内容。</div>}
    {data?.status === 'review_ready' && <>
      <div className="review-meta"><h3>{data.work.title}</h3><p>{data.volumes.length} 卷 · {data.count} 张知识卡 · {data.report.processed_ranges.length} 个声明已处理区间</p>
        {data.volumes.map(volume => <span className="pill" key={volume.volume_id}>{volume.title} · {volume.count} 段 · {volume.revision_id.slice(0, 8)}</span>)}
      </div>
      <details className="review-report" open={Boolean(data.warnings.length || data.report.issues.length)}>
        <summary>处理报告与诊断</summary>
        <ul>{[...data.warnings, ...data.report.issues].map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        <div className="report-grid">{Object.entries(data.report.category_status).map(([key, value]) => <span key={key}>
          {categories[key]} <small>{{ extracted: '已提取', absent: '已读范围无合适卡片', not_processed: '未处理', uncertain: '待核实' }[value]}</small>
        </span>)}</div>
        {data.report.processed_ranges.map((range, index) => <p className="muted" key={index}>
          {volumes.get(range.volume_id)?.title} · {range.revision_id.slice(0, 8)} · {range.start}–{range.end}
        </p>)}
      </details>
      <h3>卡片和证据抽查</h3>
      {data.samples.length > 0 && <p className="muted">每个有卡片的类别至少展示一张。核对正文是否回答具体问题，并打开原文检查关键结论。</p>}
      {!data.samples.length && <p className="muted">该结果包没有知识卡，可仅入库原文和目录。</p>}
      {data.samples.map(card => <Card key={card.card_id} card={card} openEvidence={async (_, range) => {
        try {
          const value = await api('import.preview', { batchId: data.id, volumeId: range.volume_id, revisionId: range.revision_id, start: range.start, end: range.end });
          setPreview({ ...value, range });
        } catch (failure) { setError(failure); }
      }} />)}
      {data.conflicts.length > 0 && <>
        <div className="heading-row"><h3>{data.conflicts.length} 处知识卡差异</h3>
          <label className="check"><input type="checkbox" checked={keepAll} onChange={event => setKeepAll(event.target.checked)} />保留未逐项处理的现有卡片</label>
        </div>
        {data.conflicts.map(({ current, incoming }) => <details key={current.card_id} className="import-diff">
          <summary>{current.title} <small>{({ keep: '保留现有', accept: '接受外部', merge: '已手工合并' })[resolutions[current.card_id]?.mode] ?? (keepAll ? '默认保留' : '待处理')}</small></summary>
          <div className="diff-columns"><div><h4>现有卡片</h4><Card card={current} /></div><div><h4>导入卡片</h4><Card card={incoming} /></div></div>
          <div className="button-row">
            <button onClick={() => setResolution(current.card_id, { mode: 'keep' })}>保留现有</button>
            <button onClick={() => setResolution(current.card_id, { mode: 'accept' })}>接受外部</button>
            <button onClick={() => setEditing(current)}>手工合并</button>
          </div>
        </details>)}
      </>}
      <footer className="button-row align-right sticky-actions">
        <button disabled={saving} onClick={cancel}>取消</button>
        <button type="button" className="primary" disabled={saving || (!keepAll && data.conflicts.some(item => !resolutions[item.current.card_id]))}
          onClick={async () => {
            setError(null);
            setSaving(true);
            try {
              const result = await api('import.commit', { batchId: data.id, resolutions, keepAll });
              await onCommitted(result.stats);
            } catch (failure) { setError(failure); }
            finally { setSaving(false); }
          }}>{saving ? '入库中…' : '已查看诊断，确认入库'}</button>
      </footer>
    </>}
    {preview && <Modal title={preview.volume_title} eyebrow={`证据抽查 · ${preview.range.start}–${preview.range.end}`} close={() => setPreview(null)} wide>
      <div className="preview-blocks">{preview.blocks.map(block => <p key={block.paragraph_id} className={block.highlighted ? 'proof' : ''}>
        <small>{block.paragraph_id}</small> {block.kind === 'image' ? `[插图] ${block.text}` : block.text}
      </p>)}</div>
    </Modal>}
    {editing && <Modal title="手工合并卡片" close={() => setEditing(null)} wide>
      <CardForm initial={resolutions[editing.card_id]?.card ?? editing} volumes={[...volumes.values()]} button="确认合并方案"
        submit={value => { setResolution(editing.card_id, { mode: 'merge', card: value }); setEditing(null); }} />
    </Modal>}
  </Modal>;
}

function ReaderImage({ workId, block }) {
  const [source, setSource] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    setSource(null);
    setMissing(false);
    api('reference.asset', { workId, hash: block.asset_sha256 })
      .then(value => { if (alive) setSource(value); })
      .catch(() => { if (alive) setMissing(true); });
    return () => { alive = false; };
  }, [workId, block.asset_sha256]);
  return <figure>
    {source && <img src={source} alt={block.text || '原作插图'} loading="lazy" />}
    {!source && <small>{missing ? '插图资源不可用' : '正在加载插图…'}</small>}
    {block.text && <figcaption>{block.text}</figcaption>}
  </figure>;
}

const readerStart = 'p000001';
const readerOrdinal = id => Number(id.slice(1));
const readerParagraph = ordinal => 'p' + String(ordinal).padStart(6, '0');

function readerSectionTitle(node) {
  const title = node.title?.trim();
  return title && !/^p[0-9]{5,9}$/i.test(title) ? title : structureTypes[node.type] ?? '未命名章节';
}

export function Reader({ initial, works, close, sizeControl }) {
  const [position, setPosition] = useState(initial);
  const [location, setLocation] = useState({ id: initial.start ?? readerStart, top: !initial.start });
  const [loaded, setLoaded] = useState(null);
  const [ordinal, setOrdinal] = useState(initial.start ? readerOrdinal(initial.start) : 1);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const article = useRef(null);
  const backButton = useRef(null);
  const contentsButton = useRef(null);
  const settingsButton = useRef(null);
  const result = loaded?.position === position ? loaded.result : null;
  const error = loaded?.position === position ? loaded.error : null;
  const work = works.find(item => item.work_id === position.workId);
  const volume = work?.volumes.find(item => item.volume_id === position.volumeId);
  const workTitle = result?.work_title ?? work?.title ?? '原文阅读';
  const volumeTitle = result?.volume_title ?? volume?.title;
  const revisions = volume?.revisions?.length ? volume.revisions : [{ revision_id: position.revisionId }];
  const contents = result?.structures.filter(node => node.type !== 'volume') ?? [];
  const chapter = contents.findLast(node => node.type !== 'scene' && readerOrdinal(node.start) <= ordinal && readerOrdinal(node.end) >= ordinal);
  const chapterTitle = chapter && readerSectionTitle(chapter);
  const subtitle = [volumeTitle, chapterTitle].filter((value, index, all) => value && value !== workTitle && all.indexOf(value) === index).join(' · ');

  useEffect(() => { backButton.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    let alive = true;
    api('reference.read', position)
      .then(result => { if (alive) setLoaded({ position, result }); })
      .catch(error => { if (alive) setLoaded({ position, error }); });
    return () => { alive = false; };
  }, [position]);
  useLayoutEffect(() => {
    const pane = article.current;
    if (!pane || !result) return;
    const target = pane.querySelector(`#block-${location.id}`);
    const top = target && !location.top
      ? pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top - 28
      : 0;
    pane.scrollTop = top;
    setOrdinal(readerOrdinal(location.id));
  }, [result, location]);

  function trackLocation() {
    const pane = article.current;
    if (!pane || !result) return;
    const blocks = pane.querySelectorAll('[data-reader-ordinal]');
    const edge = pane.getBoundingClientRect().top + 30;
    let low = 0;
    let high = blocks.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (blocks[middle].getBoundingClientRect().bottom > edge) high = middle;
      else low = middle + 1;
    }
    if (blocks[low]) setOrdinal(Number(blocks[low].dataset.readerOrdinal));
  }

  function go(id) {
    const target = readerOrdinal(id);
    setLocation({ id, top: false });
    if (!result || target < result.pageStart || target > result.pageEnd) {
      setPosition(current => ({ ...current, at: Math.max(1, target - 8) }));
    }
  }

  function turn(nextStart) {
    if (nextStart == null) return;
    setLocation({ id: readerParagraph(nextStart), top: true });
    setPosition(current => ({ ...current, at: nextStart }));
  }

  function returnToEvidence() {
    if (position.revisionId === initial.revisionId) go(initial.start);
    else {
      setLocation({ id: initial.start, top: false });
      setPosition(initial);
    }
  }

  function onReaderKey(event) {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (settingsOpen) {
        setSettingsOpen(false);
        settingsButton.current?.focus();
      } else if (contentsOpen) {
        setContentsOpen(false);
        contentsButton.current?.focus();
      } else close();
    } else if (event.target === article.current && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        turn(event.key === 'ArrowLeft' ? result?.previous : result?.next);
      }
    }
  }

  return <section className="reader-workspace" aria-label="原文阅读" onKeyDown={onReaderKey}>
    <header className="reader-toolbar">
      <button ref={backButton} type="button" className="reader-back" onClick={close}><span aria-hidden="true">‹</span>返回</button>
      <div className="reader-breadcrumb">
        <h1 title={workTitle}>{workTitle}</h1>
        {subtitle && <p title={subtitle}>{subtitle}</p>}
      </div>
      <div className="reader-tools">
        <button ref={contentsButton} type="button" aria-expanded={contentsOpen} aria-controls="reader-contents" onClick={() => {
          setSettingsOpen(false);
          setContentsOpen(open => !open);
        }}><Icon name="library" size={16} />目录</button>
        <button ref={settingsButton} type="button" aria-expanded={settingsOpen} aria-controls="reader-settings" onClick={() => setSettingsOpen(open => !open)}>
          <Icon name="settings" size={16} />阅读设置
        </button>
        {settingsOpen && <section className="reader-settings" id="reader-settings" aria-label="阅读设置">
          {sizeControl && <label>阅读字号 {sizeControl}</label>}
          <label>正文版本 <select aria-label="正文版本" value={position.revisionId} onChange={event => {
            setLocation({ id: readerStart, top: true });
            setPosition({ workId: position.workId, volumeId: position.volumeId, revisionId: event.target.value });
          }}>
            {revisions.map((item, index) => <option key={item.revision_id} value={item.revision_id}>{revisionLabel(item, index)}</option>)}
          </select></label>
        </section>}
      </div>
    </header>
    <div className={`reader-body ${contentsOpen ? 'has-contents' : ''}`}>
      <nav aria-label="原文目录" className="reader-toc" id="reader-contents" hidden={!contentsOpen}>
        <h2>卷章目录</h2>
        {!contents.length && <p className="muted">{result ? '这一卷暂无目录。' : '正在读取目录…'}</p>}
        {contents.map(node => <button type="button" key={node.structure_id} aria-current={chapter === node ? 'location' : undefined}
          className={node.type === 'scene' ? 'child-node' : undefined} onClick={() => {
            go(node.start);
            setContentsOpen(false);
            article.current?.focus({ preventScroll: true });
          }}>{readerSectionTitle(node)}</button>)}
      </nav>
      <article ref={article} className="reader-text" aria-label="原文正文" aria-busy={!result && !error} tabIndex={0}
        onScroll={trackLocation} onPointerDown={() => { if (settingsOpen) setSettingsOpen(false); }}>
        <div className="reader-paper">
          <ErrorMessage error={error} />
          {!result && !error && <p className="reader-status" role="status">正在读取原文…</p>}
          {result?.pageStart === 1 && <div className="reader-title">
            {volumeTitle && volumeTitle !== workTitle && <p>{workTitle}</p>}
            <h2>{volumeTitle ?? workTitle}</h2>
          </div>}
          {result?.blocks.map(block => {
            const highlighted = Boolean(block.highlighted && position.start);
            const internalLabel = block.kind === 'text' && block.text.trim() === block.paragraph_id;
            return <div key={block.paragraph_id} id={`block-${block.paragraph_id}`}
              data-reader-ordinal={block.ordinal} data-highlighted={highlighted ? 'yes' : 'no'}
              className={`reader-block ${block.kind === 'note' ? 'reader-note' : ''} ${highlighted ? 'proof' : ''}`}>
              {block.kind === 'image' ? <ReaderImage workId={position.workId} block={block} />
                : internalLabel ? highlighted && <details><summary>显示原始标识</summary><p>{block.text}</p></details>
                : <p>{block.text}</p>}
              {block.note_target && <button type="button" className="reader-note-link" onClick={() => go(block.note_target)}>返回正文</button>}
              {block.notes.map((note, index) => <button type="button" className="reader-note-link" key={note}
                onClick={() => go(note)}>{block.notes.length === 1 ? '查看注释' : `查看注释 ${index + 1}`}</button>)}
            </div>;
          })}
        </div>
      </article>
    </div>
    <footer className="reader-footer">
      <div className="reader-footer-edge">
        <button type="button" disabled={result?.previous == null} onClick={() => turn(result?.previous)}>上一页</button>
      </div>
      <div className="reader-progress" aria-label="阅读进度">
        {result && <><progress max={result.count} value={ordinal} aria-label="本卷阅读进度" /><small>{Math.min(100, Math.floor(ordinal * 100 / result.count))}%</small></>}
      </div>
      <div className="reader-footer-edge">
        {initial.start && <button type="button" className="reader-evidence" onClick={returnToEvidence}>回到证据</button>}
        <button type="button" disabled={result?.next == null} onClick={() => turn(result?.next)}>下一页</button>
      </div>
    </footer>
  </section>;
}
