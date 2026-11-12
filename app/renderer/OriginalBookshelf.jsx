import React, { useState } from 'react';
import { BookCover } from './BookCover.jsx';
import { Icon } from './ui.jsx';

export function OriginalBookshelf({ works, selected, busy, error, onSelect, onCreate }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().normalize('NFKC').toLowerCase();
  const visible = works.filter(work => work.title.normalize('NFKC').toLowerCase().includes(needle));

  return <section className="original-shelf-page" aria-labelledby="original-shelf-title">
    <div className="original-shelf-content">
      <header className="original-shelf-header">
        <div>
          <div className="eyebrow">原创写作</div>
          <h1 id="original-shelf-title" tabIndex={-1}>我的作品</h1>
        </div>
        <button type="button" className="primary original-shelf-create" onClick={onCreate} disabled={busy}>
          <Icon name="plus" size={16} />新建作品
        </button>
      </header>
      {works.length > 0 && <div className="original-shelf-tools">
        <span>{works.length} 部作品</span>
        <label className="original-shelf-search">
          <Icon name="search" size={16} />
          <input type="search" aria-label="按书名筛选原创作品" placeholder="搜索书名" value={query}
            onChange={event => setQuery(event.target.value)} />
        </label>
      </div>}
      {error && <p className="notice danger" role="alert">{error}</p>}
      {visible.length > 0 && <ul className="original-shelf-grid" aria-busy={busy}>
        {visible.map(work => <li key={work.id}>
          <button className="original-shelf-card" type="button" aria-label={work.title}
            aria-current={work.id === selected ? 'true' : undefined} onClick={() => onSelect(work.id)} disabled={busy}>
            <BookCover title={work.title} />
            <span className="original-shelf-card-label">
              <strong title={work.title}>{work.title}</strong>
              <small>{work.id === selected ? '继续写作' : '进入创作'}</small>
            </span>
          </button>
        </li>)}
      </ul>}
      {!visible.length && !error && <div className="original-shelf-empty">
        {busy && !works.length ? <p role="status">正在读取作品书架…</p>
          : works.length ? <p role="status">没有找到匹配的作品。</p>
            : <><h2>书架还是空的</h2><p>新建一部作品，就可以开始写作。</p></>}
      </div>}
    </div>
  </section>;
}
