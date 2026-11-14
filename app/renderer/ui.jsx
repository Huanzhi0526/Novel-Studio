import React, { useEffect, useRef } from 'react';
import { CardContent } from './CardContent.jsx';

export const categories = {
  character: '人物', setting: '设定', power_system: '力量体系', organization: '组织',
  event: '事件', storyline: '故事线', location: '地点', item: '物品', technique: '写作技巧'
};

export const structureTypes = {
  volume: '卷', chapter: '章', prologue: '序章', epilogue: '尾声',
  interlude: '幕间', afterword: '后记', scene: '场景', frontmatter: '卷首', unclassified: '未分类'
};

const icons = {
  book: <><path d="M5 4.5h4.5c1.4 0 2.5.6 2.5 2v13c0-1.4-1.1-2-2.5-2H5z"/><path d="M19 4.5h-4.5c-1.4 0-2.5.6-2.5 2v13c0-1.4 1.1-2 2.5-2H19z"/></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z"/><path d="m13 7 4 4m-1.5-6.5 1.3-1.3a1.6 1.6 0 0 1 2.3 0l1.7 1.7a1.6 1.6 0 0 1 0 2.3L19.5 8.5"/></>,
  library: <><path d="M5 4v16M10 4v16m4-15 5-1 3 15-5 1z"/></>,
  settings: <><path d="M5 7h14M5 17h14"/><circle cx="9" cy="7" r="2.5" fill="var(--icon-fill, var(--panel))"/><circle cx="15" cy="17" r="2.5" fill="var(--icon-fill, var(--panel))"/></>,
  panel: <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M14 5v14"/></>,
  search: <><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></>,
  send: <path d="M12 19V5m-5 5 5-5 5 5"/>,
  arrow: <path d="M7 17 17 7M8 7h9v9"/>,
  close: <path d="m7 7 10 10M17 7 7 17"/>,
  plus: <path d="M12 5v14M5 12h14"/>
};

export function Icon({ name, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

export async function api(method, args = {}) {
  const reply = await window.studio.invoke(method, args);
  if (reply.ok) return reply.value;
  const error = new Error(reply.error.message);
  Object.assign(error, reply.error);
  throw error;
}

export function ErrorMessage({ error }) {
  if (!error) return null;
  return <div className="notice danger" role="alert">
    <strong>{error.message ?? String(error)}</strong>
    {error.code && <small>{error.code}</small>}
    {error.details && <details><summary>诊断详情</summary><pre>{JSON.stringify(error.details, null, 2)}</pre></details>}
  </div>;
}

export function Modal({ title, eyebrow, children, close, wide = false, className = '', actions }) {
  const pane = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    pane.current?.focus();
    return () => previous?.focus?.();
  }, []);
  return <div className="modal-shade">
    <section ref={pane} tabIndex={-1} aria-modal="true" aria-label={title} role="dialog"
      className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          close();
        }
      }}>
      <header className="modal-head">
        <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>
        <div className="button-row">
          {actions}
          <button className="icon-button" type="button" onClick={close} aria-label="关闭"><Icon name="close" /></button>
        </div>
      </header>
      {children}
    </section>
  </div>;
}

export function PageHeader({ title, subtitle, actions, className = '' }) {
  return <header className={`topbar page-header ${className}`.trim()}>
    <div className="page-header-main">
      <h1 className="topbar-title">{title}</h1>
      {subtitle && <span className="page-header-subtitle">{subtitle}</span>}
    </div>
    {actions && <div className="page-header-actions">{actions}</div>}
  </header>;
}

export function Card({ card, openCard, openEvidence, compact = false, collapseEvidence = false, headless = false }) {
  const evidence = openEvidence ? card.evidence.map((range, index) => <button key={index} type="button" className="evidence-link"
    onClick={() => openEvidence(card, range)}
    title={range.section && range.volume_title ? `${range.volume_title} · ${range.section}` : range.volume_title ?? '查看原文'}>
    <Icon name="arrow" size={13} />
    <span className="evidence-title">[{index + 1}] {range.section || range.volume_title || '查看原文'}</span>
  </button>) : [];
  const visibleLimit = collapseEvidence ? 3 : compact ? 2 : Infinity;
  const hiddenCount = Math.max(0, evidence.length - visibleLimit);
  const links = openEvidence && evidence.length > 0 && <div className="evidence-links">
    {evidence.slice(0, visibleLimit)}
    {hiddenCount > 0 && <details className="evidence-more">
      <summary>{collapseEvidence ? `另有 ${hiddenCount} 处` : `另有 ${hiddenCount} 处原文证据`}</summary>
      {evidence.slice(visibleLimit)}
    </details>}
  </div>;
  return <article className={`knowledge-card ${compact ? 'card-compact' : ''} ${headless ? 'card-headless' : ''}`.trim()} data-category={card.category}>
    <div className="card-kicker">
      <span className="pill">{card.v2_badge ?? categories[card.category]}</span>
      {card.claim_type === 'interpretation' && <span className="pill amber">分析推断</span>}
      {!headless && card.work_title && <span>{card.work_title}</span>}
    </div>
    {!headless && <h3>{openCard ? <button type="button" className="text-button" onClick={() => openCard(card)}>{card.title}</button> : card.title}</h3>}
    <CardContent content={card.content} compact={compact} />
    {compact && openCard && card.content.length > 100 &&
      <div className="card-expand-row">
        <button className="text-button card-expand-link" type="button" onClick={() => openCard(card)}>展开全文 →</button>
      </div>}
    {collapseEvidence && openEvidence && evidence.length > 0 ? <div className="card-evidence">
      <div className="card-evidence-title">原文证据（{evidence.length}）</div>
      {links}
    </div> : links}
  </article>;
}
