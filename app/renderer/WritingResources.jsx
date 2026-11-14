import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Icon } from './ui.jsx';
import './writing-resources.css';

const MATERIAL_ELEMENTS = ['h1', 'h2', 'h3', 'h4', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr'];

const resources = {
  outline: {
    label: '大纲',
    hint: '把主线、分卷节奏或待写的章节记在这里。',
    icon: <><path d="M8 5h11M8 12h11M8 19h11"/><path d="M4 5h.01M4 12h.01M4 19h.01" strokeWidth="2.5"/></>
  },
  character: {
    label: '角色',
    hint: '为角色记下经历、动机和人物关系。',
    icon: <><circle cx="12" cy="8" r="3.2"/><path d="M5.5 19v-1.3a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4V19"/></>
  },
  setting: {
    label: '设定',
    hint: '收集世界规则、地点、组织与重要物品。',
    icon: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Zm0 9L4 7.5M12 12l8-4.5M12 12v9"/></>
  },
  chapter: {
    label: '对照',
    hint: '选择另一章，与当前正文并排阅读。',
    icon: <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14M7 9h2m6 0h2M7 13h2m6 0h2"/></>
  },
  assistant: {label:'助手',icon:<><path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8M8 12h5"/></>},
  reference: {
    label: '参考',
    icon: <><path d="M5 5v14m4-14v14m4-13 4-1 4 13-4 1z"/></>
  }
};

function moveToolFocus(event) {
  const { key, currentTarget } = event;
  if (!['Home', 'End', 'ArrowUp', 'ArrowDown'].includes(key)) return;
  event.preventDefault();
  const tools = [...currentTarget.parentElement.querySelectorAll('button:not(:disabled)')];
  const index = tools.indexOf(currentTarget);
  const next = { Home: 0, End: tools.length - 1, ArrowUp: index - 1, ArrowDown: index + 1 }[key];
  tools[(next + tools.length) % tools.length]?.focus();
}

export function WritingResourceTools({ activeKind, onSelect, hasWork }) {
  return <div className="writing-resource-tools" role="group" aria-label="写作资料速查">
    {Object.entries(resources).map(([kind, resource]) => <button type="button" key={kind}
      className={`writing-resource-tool${kind === 'reference' ? ' reference-tool' : ''}`}
      disabled={!hasWork && kind !== 'reference'} aria-pressed={activeKind === kind}
      title={{ chapter: '章节对照', reference: '参考库检索', assistant:'创作助手' }[kind] ?? `${resource.label}速查`}
      onClick={event => onSelect(kind, event)} onKeyDown={moveToolFocus}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{resource.icon}</svg>
      <span>{resource.label}</span>
    </button>)}
  </div>;
}

export function WritingResources(props) {
  const resource = resources[props.kind];
  return resource ? <ResourcePanel key={props.kind} {...props} label={resource.label} hint={resource.hint} /> : null;
}

function ResourcePanel({ kind, documents, preview, onPreview, onOpen, onCreate, label, hint, renderActions, trash, activeId, transitioning }) {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLocaleLowerCase();
  const matching = documents.filter(doc => doc.title.toLocaleLowerCase().includes(query));
  const active = documents.find(doc => doc.id === preview?.id);
  const isChapter = kind === 'chapter';
  const listLabel = isChapter ? '章节' : label;

  return <section className="writing-resources" aria-label={isChapter ? '章节对照' : `${label}速查`}>
    <div className="writing-resources-actions">
      <input type="search" aria-label={`筛选${listLabel}标题`} placeholder={isChapter ? '筛选章节标题' : '筛选标题'}
        value={filter} onChange={event => setFilter(event.target.value)} />
      {!isChapter && <button className="resource-create" type="button" disabled={transitioning} onClick={() => onCreate(kind)}>
        <Icon name="plus" size={14} />新建{label}
      </button>}
    </div>
    {documents.length === 0 ? <div className="resource-empty">
      <strong>还没有{listLabel}</strong><p>{hint}</p>
    </div> : matching.length === 0 ? <p className="resource-empty" role="status">没有匹配的{listLabel}标题。</p> :
      <ul className="resource-list" aria-label={`${listLabel}列表`}>
        {matching.map(doc => <li key={doc.id}>
          <button type="button" aria-current={doc.id === active?.id ? 'true' : undefined}
            title={doc.title} onClick={() => onPreview(doc)}>{doc.title}{isChapter && <small>{doc.volumeTitle}</small>}</button>
        </li>)}
      </ul>}
    {active ? <section className="resource-preview" aria-label="条目预览" key={active.id}>
      <header>
        <h3 title={active.title}>{active.title}</h3>
        <div className="resource-preview-actions">
          {!isChapter && renderActions(active)}
          {active.id === activeId ? <small>正在编辑</small> :
            <button className="resource-open" type="button" disabled={Boolean(preview.loading || preview.error || transitioning)}
              onClick={() => onOpen(active.id)}>打开编辑<Icon name="arrow" size={13} /></button>}
        </div>
      </header>
      {preview.loading ? <p className="resource-preview-note" role="status">正在读取内容…</p> : preview.error ?
        <div className="resource-preview-note">
          <p role="alert">{preview.error}</p>
          <button className="resource-open" type="button" onClick={() => onPreview(active)}>重试</button>
        </div> : preview.text ? (isChapter
          ? <pre tabIndex={0} aria-label="条目正文">{preview.text}</pre>
          : <div className="resource-markdown" tabIndex={0} aria-label="条目正文">
              <Markdown allowedElements={MATERIAL_ELEMENTS} unwrapDisallowed skipHtml>{preview.text}</Markdown>
            </div>) :
          <p className="resource-preview-note">此条目还没有内容，可以打开编辑。</p>}
    </section> : documents.length > 0 && <p className="resource-preview-note">
      {isChapter ? hint : '选择条目即可预览，正文继续留在编辑器中。'}
    </p>}
    {trash}
  </section>;
}
