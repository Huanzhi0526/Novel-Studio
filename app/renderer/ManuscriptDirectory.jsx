import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon } from './ui.jsx';
import './manuscript-directory.css';

function normalizeTitle(title) {
  return title.normalize('NFKC').trim().toLocaleLowerCase();
}

export function ManuscriptDirectory({
  workId,
  volumes,
  docs,
  activeId,
  transitioning,
  renderDocument,
  onCreateVolume,
  onCreateChapter,
  onImportVolume,
  onMoveVolume,
  onRenameVolume,
  collapsed = [],
  onToggleVolume,
  onSearchManuscript,
  ActionMenu,
}) {
  const [searchText, setSearchText] = useState('');
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const directoryId = useId();
  const query = normalizeTitle(searchText);
  const closedVolumes = new Set(collapsed);
  const chaptersByVolume = new Map();
  let activeVolumeId;

  for (const doc of docs) {
    if (doc.kind !== 'chapter' || doc.deleted) continue;
    if (!chaptersByVolume.has(doc.volume_id)) chaptersByVolume.set(doc.volume_id, []);
    chaptersByVolume.get(doc.volume_id).push(doc);
    if (doc.id === activeId) activeVolumeId = doc.volume_id;
  }

  const groups = volumes.flatMap((volume) => {
    const chapters = chaptersByVolume.get(volume.id) ?? [];
    if (!query || normalizeTitle(volume.title).includes(query)) return [{ volume, chapters }];
    const matches = chapters.filter((chapter) => normalizeTitle(chapter.title).includes(query));
    return matches.length ? [{ volume, chapters: matches }] : [];
  });

  const activeVolumeClosed = closedVolumes.has(activeVolumeId);
  const newChapterVolume = volumes.find((volume) => volume.id === activeVolumeId) ?? volumes[0];
  useEffect(() => setSearchText(''), [workId]);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (query) {
      list.scrollTop = 0;
      return;
    }
    const row = list.querySelector('.doc-row.active, .volume-row.contains-active');
    if (!row) return;
    const bounds = list.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    if (rowBounds.top < bounds.top) list.scrollTop += rowBounds.top - bounds.top;
    if (rowBounds.bottom > bounds.bottom) list.scrollTop += rowBounds.bottom - bounds.bottom;
  }, [activeId, activeVolumeId, activeVolumeClosed, query, workId]);

  if (!workId) return null;

  return (
    <section className="manuscript-directory" aria-label="卷章目录">
      <div className="manuscript-directory-actions">
        <button
          type="button"
          className="manuscript-create-chapter"
          title={newChapterVolume ? `在${newChapterVolume.title}中新建章节` : '请先新建分卷'}
          onClick={() => onCreateChapter(newChapterVolume.id)}
          disabled={transitioning || !newChapterVolume}
        >
          <Icon name="plus" size={15} />
          新建章节
        </button>
        <button
          type="button"
          className="manuscript-create-volume"
          aria-label="新建分卷"
          title="新建分卷"
          onClick={onCreateVolume}
          disabled={transitioning}
        >
          <Icon name="book" size={15} />
          分卷
        </button>
      </div>
      <div className="manuscript-directory-tools">
        <div className="manuscript-directory-search">
          <Icon name="search" size={14} />
          <input
            ref={searchRef}
            aria-label="搜索卷章"
            placeholder="搜索卷章"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          {searchText && (
            <button
              type="button"
              className="icon-button manuscript-search-clear"
              aria-label="清除卷章搜索"
              title="清除搜索"
              onClick={() => {
                setSearchText('');
                searchRef.current?.focus();
              }}
            >
              <Icon name="close" size={13} />
            </button>
          )}
        </div>
        {onSearchManuscript && (
          <button
            type="button"
            className="manuscript-search-full"
            aria-label="搜索全书正文"
            title="搜索全书正文"
            onClick={() => onSearchManuscript(searchText.trim())}
            disabled={transitioning}
          >
            全文
          </button>
        )}
      </div>
      <div ref={listRef} className="tree-scroll manuscript-directory-list">
        {groups.length === 0 && (
          <p className="manuscript-directory-empty" role="status">
            {query ? '没有匹配的卷章' : '还没有分卷'}
          </p>
        )}
        {groups.map(({ volume, chapters }) => {
          const expanded = Boolean(query) || !closedVolumes.has(volume.id);
          const containsActive = !expanded && activeVolumeId === volume.id;
          const chaptersId = `${directoryId}-${volume.id}`;
          return (
            <div key={volume.id} className="volume-group">
              <div className={`tree-row volume-row${containsActive ? ' contains-active' : ''}`}>
                <button
                  type="button"
                  className="volume-toggle"
                  aria-current={containsActive ? 'location' : undefined}
                  aria-expanded={expanded}
                  aria-controls={chaptersId}
                  aria-disabled={query || transitioning ? true : undefined}
                  title={volume.title}
                  onClick={() => {
                    if (!query && !transitioning) onToggleVolume(volume.id);
                  }}
                >
                  <span className="volume-chevron" aria-hidden="true" />
                  <span className="volume-title">{volume.title}</span>
                </button>
                <div className="tree-actions">
                  <button
                    type="button"
                    className="icon-button"
                    title="新章节"
                    aria-label={`在${volume.title}中新建章节`}
                    disabled={transitioning}
                    onClick={() => onCreateChapter(volume.id)}
                  >
                    <Icon name="plus" size={13} />
                  </button>
                  <ActionMenu label={volume.title} actions={[
                    ['导入 TXT 到本卷', () => onImportVolume(volume.id)],
                    ['上移', () => onMoveVolume(volume.id, -1), '上移'],
                    ['下移', () => onMoveVolume(volume.id, 1), '下移'],
                    ['重命名', () => onRenameVolume(volume.id, volume.title)],
                  ]} />
                </div>
              </div>
              <div id={chaptersId} hidden={!expanded}>
                {expanded && chapters.map(renderDocument)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
