import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChangeSet, Compartment, EditorState, StateField } from '@codemirror/state';
import { EditorView, Decoration, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, isolateHistory, redo, redoDepth, undo, undoDepth } from '@codemirror/commands';
import { search, searchKeymap, openSearchPanel, closeSearchPanel } from '@codemirror/search';
import { ManuscriptDirectory } from './ManuscriptDirectory.jsx';
import { OriginalBookshelf } from './OriginalBookshelf.jsx';
import { WritingPreferences } from './Preferences.jsx';
import { WritingResources, WritingResourceTools } from './WritingResources.jsx';
import { ExpansionDialog } from './ExpansionDialog.jsx';
import { enclosingExpansionPair, expansionSelection } from '../shared/expansion-selection.mjs';
import { orderedChapters } from './writing-order.mjs';
import { matchingPosition, readWritingSession, rememberPosition, toggleCollapsedVolume, writeWritingSession } from './writing-session.mjs';
import { Icon } from './ui.jsx';
import './writing.css';

const flushers = new Set();
export function flushWriting() {
  return Promise.all([...flushers].map(fn => fn()));
}

const MARK_TYPES = [{ value: 'foreshadow', label: '伏笔' }, { value: 'setup', label: '铺垫' }, { value: 'key', label: '关键句' }, { value: 'other', label: '其他' }];
const WORK_SECTIONS = {
  chapter: { label: '正文' },
  outline: { label: '大纲', create: '新建大纲' },
  character: { label: '角色', create: '新建角色' },
  setting: { label: '设定', create: '新建设定' }
};
const searchPhrases = {
  Find: '查找文字', Replace: '替换为', next: '下一个', previous: '上一个', all: '全选匹配',
  'match case': '区分大小写', regexp: '正则', 'by word': '全词', replace: '替换', 'replace all': '全部替换',
  close: '关闭查找', 'current match': '当前匹配', 'on line': '行'
};
const wordCount = text => (text.match(/[\p{L}\p{N}]/gu) || []).length;
function formatHistoryDelta(delta) {
  if (delta === 0) return '±0';
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}
function editorExpansionSelection(state) {
  const { from, to, empty } = state.selection.main;
  if (empty || state.selection.ranges.length !== 1) return null;
  const start = Math.max(0, from - 1);
  const end = Math.min(state.doc.length, to + 1);
  const match = expansionSelection(state.sliceDoc(start, end), from - start, to - start);
  return match && { ...match, from: match.from + start, to: match.to + start };
}
function cursorExpansionPrompt(state, kind) {
  if (kind !== 'chapter' || state.selection.ranges.length !== 1) return null;
  const { empty, head } = state.selection.main;
  if (!empty) return null;
  const line = state.doc.lineAt(head);
  const match = enclosingExpansionPair(line.text, head - line.from);
  return match && { ...match, from: line.from + match.from, to: line.from + match.to };
}

function tidyParagraphs(view) {
  const changes = [];
  let blank = false;
  for (let number = 1; number <= view.state.doc.lines; number++) {
    const line = view.state.doc.line(number);
    let end = line.text.length;
    while (end > 0 && (line.text[end - 1] === ' ' || line.text[end - 1] === '\t')) end--;
    const empty = end === 0;
    if (blank && empty) changes.push({ from: line.from - 1, to: line.to });
    else if (end !== line.length) changes.push({ from: line.from + end, to: line.to });
    blank = empty;
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: 'input.format', annotations: isolateHistory.of('full') });
  return true;
}
function ActionMenu({ label, actions, groups, caption, summaryLabel }) {
  const menu = useRef(null);
  useEffect(() => {
    function dismiss(event) {
      if (menu.current?.open && !menu.current.contains(event.target)) menu.current.open = false;
    }
    function observeToggle() {
      if (menu.current?.open) document.addEventListener('pointerdown', dismiss);
      else document.removeEventListener('pointerdown', dismiss);
    }
    const node = menu.current;
    node.addEventListener('toggle', observeToggle);
    return () => {
      node.removeEventListener('toggle', observeToggle);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, []);
  const accessible = summaryLabel ?? `更多${label}操作`;
  const renderItem = ([title, action, menuTitle, disabled]) => (
    <button key={title} type="button" disabled={disabled} title={menuTitle || title} onClick={event => {
      event.currentTarget.closest('details').open = false;
      action();
    }}>{title}</button>
  );
  return <details ref={menu} className={caption ? 'rail-menu has-caption' : 'rail-menu'} onKeyDown={event => {
    if (event.key === 'Escape' && menu.current.open) {
      event.stopPropagation();
      menu.current.open = false;
      menu.current.querySelector('summary').focus();
    }
  }}>
    <summary title={accessible} aria-label={accessible}>{caption ?? '⋯'}</summary>
    <div className="rail-menu-items">
      {groups ? groups.filter(group => group.items?.length).map(group => (
        <div key={group.key ?? group.heading} className={group.className ? `rail-menu-group ${group.className}` : 'rail-menu-group'}>
          {group.heading && <div className="rail-menu-heading">{group.heading}</div>}
          {group.items.map(renderItem)}
        </div>
      )) : actions.map(renderItem)}
    </div>
  </details>;
}
const markDecorations = (marks, pending = []) => StateField.define({
  create: state => decorationsFor(state, marks, pending),
  update: (decorations, tr) => decorations.map(tr.changes),
  provide: f => EditorView.decorations.from(f)
});
function decorationsFor(state, marks, pending) {
  let length = state.doc.length;
  for (const group of pending) for (const { from, to, insert } of group) length += to - from - insert.length;
  const ranges = [];
  for (const mark of marks || []) if (!mark.invalid && mark.end > mark.start && mark.start >= 0 && mark.end <= length) {
    ranges.push(Decoration.mark({ class: 'writing-mark', attributes: { 'data-mark-type': mark.type } }).range(mark.start, mark.end));
  }
  let decorations = Decoration.set(ranges, true);
  for (const group of pending) {
    const changes = ChangeSet.of(group, length);
    decorations = decorations.map(changes);
    length = changes.newLength;
  }
  return decorations;
}

function InlineExpansionPreview({ review, onKeep, onRestore, onRegenerate }) {
  const host = useRef(null);
  useLayoutEffect(() => {
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: review.doc,
        extensions: [
          EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': '章节正文中的 AI 扩写预览', tabindex: '0' }),
          EditorView.decorations.of(review.decorations)
        ]
      })
    });
    view.contentDOM.focus({ preventScroll: true });
    view.dispatch({ effects: EditorView.scrollIntoView(review.from, { y: 'center' }) });
    return () => view.destroy();
  }, [review]);

  return <section className="expansion-inline-preview" aria-label="正文内的扩写预览">
    <div className="expansion-review-bar">
      <div className="expansion-review-caption" role="status">
        <strong>AI 扩写预览</strong><span>虚线标出新增内容 · 待确认</span>
      </div>
      <div className="expansion-review-actions">
        <button type="button" onClick={onRegenerate}>重新生成</button>
        <button type="button" onClick={onRestore}>恢复原文 <kbd aria-hidden="true">Esc</kbd></button>
        <button type="button" className="expansion-keep" onClick={onKeep}>保留这段</button>
      </div>
    </div>
    <div className="editor-host" data-expansion-preview-text ref={host} />
  </section>;
}

export function Writing({ api, renderReference, renderAssistant, setFocused, railTarget = null, preferences, updatePreferences, onExpansionSettings }) {
  const [listing, setListing] = useState({ works: [], volumes: [], docs: [] });
  const [selectedWork, setSelectedWork] = useState(null);
  const [inBookshelf, setInBookshelf] = useState(true);
  const shelfHost = useRef(null);
  const [activeId, setActiveId] = useState(null);
  const [doc, setDoc] = useState(null);
  const [marks, setMarks] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyPreview, setHistoryPreview] = useState(null);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [canExpand, setCanExpand] = useState(false);
  const [enclosingPrompt, setEnclosingPrompt] = useState(null);
  const [expansion, setExpansion] = useState(null);
  const expansionReview = expansion?.review;
  const isPreviewing = Boolean(expansionReview);
  const [markType, setMarkType] = useState('foreshadow');
  const [markNote, setMarkNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [transitioning, setTransitioning] = useState(true);
  const [liveWordCount, setLiveWordCount] = useState(0);
  const [toolPanel, setToolPanel] = useState(null);
  const [resourceKind, setResourceKind] = useState('outline');
  const [undoState, setUndoState] = useState({ undo: false, redo: false });
  const [searchText, setSearchText] = useState('');
  const [bodySearch, setBodySearch] = useState(null);
  const [formatStatus, setFormatStatus] = useState('');
  const session = useRef(null);
  if (!session.current) session.current = readWritingSession();
  const [collapsed, setCollapsed] = useState(session.current.collapsed);
  const [wideWindow, setWideWindow] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1120);
  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(null), dialogTrigger = useRef(null), drawerRef = useRef(null), drawerTrigger = useRef(null);
  const focusDrawer = useRef(false);
  const viewHost = useRef(null), viewRef = useRef(null), shellRef = useRef(null), timer = useRef(null), stageTimer = useRef(null), markCompartment = useRef(new Compartment());
  const textRef = useRef(''), baseRevision = useRef(null), dirty = useRef(false), edits = useRef([]), saveQueue = useRef(Promise.resolve());
  const currentId = useRef(null), transition = useRef(true), editLock = useRef(new Compartment());
  const positionTimer = useRef(null), initializingView = useRef(null), queuedJump = useRef(null);
  const focusNewDocument = useRef(false);
  const previewRequest = useRef(0);
  const searchRequest = useRef(0);
  const autoOpened = useRef(false);

  const reload = useCallback(async workId => {
    try { const next = await api('writing.list', workId ? { workId } : {}); setListing(next); if (workId) setSelectedWork(workId); }
    catch (e) { setError(e.message || '无法读取作品列表'); }
  }, [api]);
  useEffect(() => {
    let active = true;
    async function loadBookshelf() {
      let recentId = null;
      try {
        const next = await api('writing.list');
        if (!active) return;
        setListing(next);
        const candidate = session.current.recent?.workId;
        if (!autoOpened.current && candidate && next.works.some(work => work.id === candidate)) {
          autoOpened.current = true;
          recentId = candidate;
        }
      } catch (failure) {
        if (active) setError(failure.message || '无法读取作品书架');
      } finally {
        if (active) {
          transition.current = false;
          if (!recentId) setTransitioning(false);
        }
      }
      if (active && recentId) {
        await chooseWork(recentId);
      }
    }
    void loadBookshelf();
    return () => { active = false; };
  }, [api]);
  useEffect(() => { const media=window.matchMedia('(min-width: 1120px)');const update=()=>setWideWindow(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update); }, []);
  useEffect(() => { setFocused?.(focusMode && !inBookshelf); }, [focusMode, inBookshelf, setFocused]);
  const dialogOpen = Boolean(dialog);
  useEffect(() => {
    if (!dialogOpen) return;
    const form = dialogRef.current;
    const trigger = dialogTrigger.current;
    const field = form.querySelector('input');
    (field ?? form.querySelector('button')).focus();
    field?.select();
    return () => {
      if (focusNewDocument.current) return;
      if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
      else viewRef.current?.focus();
    };
  }, [dialogOpen]);
  useEffect(() => {
    if (!toolPanel || !focusDrawer.current) return;
    focusDrawer.current = false;
    const drawer = drawerRef.current;
    (drawer?.querySelector('#sidebar-query, input') ?? drawer?.querySelector('button'))?.focus();
  }, [toolPanel, resourceKind]);
  useEffect(() => {
    function handleWindowEscape(event) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || viewRef.current?.composing) return;
      if (inBookshelf || !shellRef.current || shellRef.current.closest('[hidden]')) return;
      if (document.querySelector('.modal-shade, .reader-backdrop')) return;
      const openMenus = [
        ...shellRef.current.querySelectorAll('details.rail-menu[open]'),
        ...(railTarget ? railTarget.querySelectorAll('details.rail-menu[open]') : [])
      ];
      if (openMenus.length) {
        event.preventDefault();
        for (const menu of openMenus) menu.open = false;
        openMenus[openMenus.length - 1].querySelector('summary')?.focus();
        return;
      }
      if (dialog) {
        if (!transition.current) {
          event.preventDefault();
          setDialog(null);
        }
        return;
      }
      if (expansion && !expansionReview) {
        event.preventDefault();
        closeExpansion();
        return;
      }
      if (shellRef.current.querySelector('.cm-search')) {
        event.preventDefault();
        if (viewRef.current) {
          closeSearchPanel(viewRef.current);
          viewRef.current.focus();
        }
        return;
      }
      if (expansionReview) {
        event.preventDefault();
        closeExpansion();
        return;
      }
      if (toolPanel) {
        event.preventDefault();
        closeToolPanel(true);
        return;
      }
      if (focusMode) {
        event.preventDefault();
        setFocusMode(false);
      }
    }
    window.addEventListener('keydown', handleWindowEscape);
    return () => window.removeEventListener('keydown', handleWindowEscape);
  }, [inBookshelf, dialog, expansion, expansionReview, toolPanel, focusMode, railTarget]);

  const persistSession = useCallback(() => {
    writeWritingSession({ ...session.current, layout: readWritingSession().layout });
  }, []);

  const capturePosition = useCallback(() => {
    clearTimeout(positionTimer.current);
    const view = viewRef.current;
    if (!view || view === initializingView.current || !currentId.current || dirty.current || !view.scrollDOM.clientHeight) return;
    const { anchor, head } = view.state.selection.main;
    session.current = rememberPosition(session.current, currentId.current, {
      revision: baseRevision.current, anchor, head, scrollTop: view.scrollDOM.scrollTop
    });
    persistSession();
  }, [persistSession]);
  const schedulePosition = useCallback(() => {
    clearTimeout(positionTimer.current);
    positionTimer.current = setTimeout(capturePosition, 240);
  }, [capturePosition]);
  const formatBody = useCallback(view => {
    if (!view || view.state.readOnly || view.composing) return false;
    setFormatStatus(tidyParagraphs(view) ? '已整理段落，可撤销' : '段落已整齐');
    view.focus();
    return true;
  }, []);
  const doSave = useCallback(async (boundary = false) => {
    const id = currentId.current;
    if (!id) return saveQueue.current;
    const task = async () => {
      if (id !== currentId.current || (!dirty.current && !boundary)) return;
      const expectedRevision = baseRevision.current;
      const text = textRef.current;
      const editGroups = edits.current.slice();
      setSaving(true); setStatus('保存中…');
      try {
        await api('writing.stage', { id, expectedRevision, text, edits: editGroups, boundary });
        const saved = await api('writing.save', { id, expectedRevision, text, edits: editGroups, boundary });
        if (currentId.current === id) {
          baseRevision.current = saved.revision;
          edits.current.splice(0, editGroups.length);
          dirty.current = textRef.current !== text || edits.current.length > 0;
          setMarks(saved.marks || []);
          setError(''); setStatus(dirty.current ? '未保存' : '已保存');
          capturePosition();
        }
        return saved;
      } catch (e) {
        setStatus('保存失败'); setError(e.message || '保存失败；正文仍保留在编辑器中，可导出 TXT。');
        throw e;
      } finally { setSaving(false); }
    };
    saveQueue.current = saveQueue.current.then(task, task);
    return saveQueue.current;
  }, [api, capturePosition]);
  useEffect(() => {
    const f = async () => { await doSave(true); capturePosition(); };
    flushers.add(f);
    const onFlush = event => { event.detail?.register?.(f()); };
    window.addEventListener('novel-flush', onFlush);
    return () => {
      flushers.delete(f);
      window.removeEventListener('novel-flush', onFlush);
      clearTimeout(timer.current);
      clearTimeout(stageTimer.current);
      clearTimeout(positionTimer.current);
    };
  }, [doSave, capturePosition]);

  const scheduleSave = useCallback(() => {
    clearTimeout(timer.current); clearTimeout(stageTimer.current); setStatus('未保存');
    const id = currentId.current;
    stageTimer.current = setTimeout(() => {
      const stageTask = async () => {
        if (id !== currentId.current || !dirty.current) return;
        try { await api('writing.stage', { id, expectedRevision: baseRevision.current, text: textRef.current, edits: edits.current.slice() }); }
        catch (e) { setError(e.message || '草稿暂存失败；正文仍留在编辑器中。'); setStatus('草稿暂存失败'); }
      };
      saveQueue.current = saveQueue.current.then(stageTask, stageTask);
    }, 120);
    timer.current = setTimeout(() => {
      if (id === currentId.current) void doSave(false).catch(() => {});
    }, 800);
  }, [doSave, api]);
  useEffect(() => {
    if (toolPanel !== 'history' || !activeId) return;
    let active = true;
    setHistoryPreview(null);
    setHistoryLimit(20);
    async function loadHistory() {
      try {
        await doSave(false);
        const items = await api('writing.history', { id: activeId });
        if (active && currentId.current === activeId) setHistoryItems(items);
      } catch (failure) {
        if (active) setError(failure.message);
      }
    }
    void loadHistory();
    return () => { active = false; };
  }, [toolPanel, activeId, api, doSave]);

  async function withEditorLocked(operation, failure = '操作失败') {
    if (transition.current) return;
    if (expansionReview) closeExpansion(false);
    transition.current = true;
    setTransitioning(true);
    const view = viewRef.current;
    const id = currentId.current;
    view?.dispatch({ effects: editLock.current.reconfigure([EditorState.readOnly.of(true), EditorView.editable.of(false)]) });
    try {
      await operation();
    } catch (error) {
      setError(error.message || failure);
    } finally {
      if (view && view === viewRef.current && id === currentId.current) {
        view.dispatch({ effects: editLock.current.reconfigure([]) });
      }
      transition.current = false;
      setTransitioning(false);
    }
  }

  function installDocument(opened, jump = null) {
    capturePosition();
    clearTimeout(timer.current);
    clearTimeout(stageTimer.current);
    currentId.current = opened?.id ?? null;
    queuedJump.current = jump;
    textRef.current = opened?.text ?? '';
    baseRevision.current = opened?.revision ?? null;
    dirty.current = false;
    edits.current = [];
    setActiveId(currentId.current);
    setDoc(opened);
    setSelectedText('');
    setCanExpand(false);
    setEnclosingPrompt(null);
    setExpansion(null);
    setLiveWordCount(wordCount(textRef.current));
    setMarks(opened?.marks ?? []);
    setHistoryItems([]);
    setHistoryPreview(null);
    setHistoryLimit(20);
    setUndoState({ undo: false, redo: false });
    setFormatStatus('');
    setError('');
    setStatus(opened?.recovered ? '已恢复未完成编辑' : '');
    if (opened) {
      session.current = { ...session.current, recent: { workId: opened.work_id, docId: opened.id } };
      persistSession();
    }
  }

  function searchSelection(text, jump) {
    const anchor = text.startsWith(jump.query, jump.offset) ? jump.offset : text.indexOf(jump.query);
    return anchor < 0 ? null : { anchor, head: anchor + jump.query.length };
  }
  async function openDoc(id, jump = null) {
    if (id === currentId.current) {
      if (jump && viewRef.current) {
        if (expansionReview) closeExpansion(false);
        const selection = searchSelection(textRef.current, jump);
        if (selection) {
          viewRef.current.dispatch({ selection, scrollIntoView: true });
          viewRef.current.focus();
        } else setError('正文已变更，请重新搜索。');
      }
      return;
    }
    await withEditorLocked(async () => {
      await doSave(true);
      const opened = await api('writing.open', { id });
      const selection = jump ? searchSelection(opened.text, jump) : null;
      installDocument(opened, selection);
      if (jump && !selection) setError('正文已变更，请重新搜索。');
    }, '打开文档失败');
  }

  useEffect(() => {
    if (!viewHost.current || !doc) return;
    const position = matchingPosition(session.current, doc.id, doc.revision, doc.text.length);
    const jump = queuedJump.current;
    const focus = focusNewDocument.current;
    queuedJump.current = null;
    focusNewDocument.current = false;
    const state = EditorState.create({
      doc: doc.text,
      selection: jump ?? (position ? { anchor: position.anchor, head: position.head } : undefined),
      extensions: [history(), search(), EditorState.phrases.of(searchPhrases),
        keymap.of([{ key: 'Mod-s', run: () => { void doSave(true).catch(() => {}); return true; } },
          { key: 'Mod-k', run: formatBody },
          ...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        editLock.current.of([]), markCompartment.current.of(markDecorations(marks)), EditorView.lineWrapping,
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            textRef.current = update.state.doc.toString(); dirty.current = true;
            if (!update.transactions.some(tr => tr.isUserEvent('input.format'))) setFormatStatus('');
            let wordDelta = 0;
            for (const tr of update.transactions) if (tr.docChanged) {
              const group = [];
              tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
                const insert = inserted.toString();
                group.push({ from, to, insert });
                wordDelta += wordCount(insert) - wordCount(tr.startState.sliceDoc(from, to));
              });
              edits.current.push(group);
            }
            setLiveWordCount(count => count + wordDelta);
            setUndoState({ undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 });
            scheduleSave();
          }
          if (update.selectionSet || update.docChanged) {
            const { from, to } = update.state.selection.main;
            setSelectedText(update.state.sliceDoc(from, to));
            const expand = doc.kind === 'chapter' && Boolean(editorExpansionSelection(update.state));
            setCanExpand(expand);
            setEnclosingPrompt(expand ? null : cursorExpansionPrompt(update.state, doc.kind));
            schedulePosition();
          }
        }), EditorView.domEventHandlers({
          blur: () => { void doSave(false).catch(() => {}); },
          scroll: schedulePosition
        })]
    });
    const view = new EditorView({ state, parent: viewHost.current }); viewRef.current = view;
    if (focus) view.focus();
    const selection = state.selection.main;
    setSelectedText(state.sliceDoc(selection.from, selection.to));
    const expand = doc.kind === 'chapter' && Boolean(editorExpansionSelection(state));
    setCanExpand(expand);
    setEnclosingPrompt(expand ? null : cursorExpansionPrompt(state, doc.kind));
    let frame;
    if (jump || position) {
      initializingView.current = view;
      view.dispatch({ effects: EditorView.scrollIntoView(selection.head, { y: 'center' }) });
      // Let CodeMirror measure wrapped lines before applying the saved pixel offset.
      frame = requestAnimationFrame(() => {
        if (!jump && view.scrollDOM.clientHeight) view.scrollDOM.scrollTop = position.scrollTop;
        initializingView.current = null;
        if (jump) view.focus();
        schedulePosition();
      });
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (initializingView.current === view) initializingView.current = null;
      view.destroy(); viewRef.current = null;
    };
  }, [doc, scheduleSave, doSave, schedulePosition, formatBody]);
  useEffect(() => {
    const view = viewRef.current;
    if (view) view.dispatch({ effects: markCompartment.current.reconfigure(markDecorations(marks, edits.current)) });
  }, [marks]);

  function selectEnclosingPrompt() {
    const view = viewRef.current;
    if (!view || !enclosingPrompt || doc?.kind !== 'chapter' || transition.current || isPreviewing) return;
    const { from, to } = enclosingPrompt;
    if (to > view.state.doc.length) return;
    view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
    view.focus();
  }

  function openExpansion() {
    const view = viewRef.current;
    if (expansion || doc?.kind !== 'chapter' || doc.id !== currentId.current || transition.current || !view || view.state.readOnly || view.composing) return;
    const match = editorExpansionSelection(view.state);
    if (!match) return;
    setExpansion({ ...match, workId: doc.work_id, docId: doc.id, chapterText: view.state.sliceDoc(),
      sourceView: view, sourceDoc: view.state.doc, selection: view.state.selection });
  }

  function closeExpansion(restoreFocus = true) {
    const view = viewRef.current;
    setExpansion(null);
    if (restoreFocus) requestAnimationFrame(() => { if (view && viewRef.current === view) view.focus(); });
  }

  function expansionSource() {
    const view = viewRef.current;
    if (!expansion || !view || expansion.sourceView !== view || expansion.docId !== currentId.current
      || expansion.sourceDoc !== view.state.doc || !expansion.selection.eq(view.state.selection)
      || transition.current || view.composing || view.state.readOnly) return null;
    return view;
  }

  const staleExpansion = '正文或选区已变化，请重新选中提示。';
  function previewExpansion(text, useMaterials) {
    const view = expansionSource();
    if (!view) return staleExpansion;
    const { from, to } = expansion;
    const insert = view.state.toText(text);
    const changes = view.state.changes({ from, to, insert });
    const end = from + insert.length;
    const ranges = [Decoration.mark({ tagName: 'mark', class: 'expansion-preview-insert' }).range(from, end)];
    const originalMarks = decorationsFor(view.state, marks, edits.current).map(changes);
    originalMarks.between(0, changes.newLength, (start, stop, mark) => {
      if (start < from) ranges.push(mark.range(start, Math.min(stop, from)));
      if (stop > end) ranges.push(mark.range(Math.max(start, end), stop));
    });
    setExpansion({ ...expansion, useMaterials, review: { from, end, changes, doc: changes.apply(view.state.doc),
      decorations: Decoration.set(ranges, true) } });
  }

  function applyExpansion() {
    const view = expansionSource();
    if (!view) {
      setError(staleExpansion);
      closeExpansion();
      return;
    }
    const { changes, end } = expansionReview;
    view.dispatch({ changes, selection: { anchor: end },
      scrollIntoView: true, userEvent: 'input.expand', annotations: isolateHistory.of('full') });
    setFormatStatus('已插入扩写，可撤销');
    closeExpansion();
  }

  const volumes = listing.volumes;
  const liveDocs = listing.docs.filter(item => !item.deleted);
  const chapters = orderedChapters(volumes, listing.docs);
  const chapterIndex = chapters.findIndex(item => item.id === activeId);
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null;
  const nextChapter = chapterIndex >= 0 ? chapters[chapterIndex + 1] : null;
  async function returnToBookshelf() {
    await withEditorLocked(async () => {
      await doSave(true);
      setInBookshelf(true);
      requestAnimationFrame(() => {
        const shelf = shelfHost.current;
        const target = shelf?.querySelector('.original-shelf-card[aria-current]') ?? shelf?.querySelector('#original-shelf-title');
        target?.focus();
      });
    }, '暂时无法返回书架，当前内容仍保留。');
  }
  async function chooseWork(id) {
    if (transition.current) return;
    if (id === selectedWork) {
      setInBookshelf(false);
      requestAnimationFrame(() => viewRef.current?.focus());
      return;
    }
    await withEditorLocked(async () => {
      const next = await api('writing.list', { workId: id });
      const available = next.docs.filter(item => !item.deleted);
      const chapters = orderedChapters(next.volumes, next.docs);
      const recent = session.current.recent;
      const lastDocument = recent?.workId === id && available.some(item => item.id === recent.docId) ? recent.docId : null;
      const lastChapter = Object.keys(session.current.positions).reverse().find(id => chapters.some(item => item.id === id));
      const nextId = lastDocument ?? lastChapter ?? chapters[0]?.id;
      const opened = nextId ? await api('writing.open', { id: nextId }) : null;
      focusNewDocument.current = Boolean(opened);
      installDocument(opened);
      if (!nextId) {
        session.current = { ...session.current, recent: null };
        persistSession();
      }
      setListing(next);
      setSelectedWork(id);
      setSearchText('');
      setBodySearch(null);
      closeToolPanel();
      setError('');
      setInBookshelf(false);
    }, '切换作品失败；未保存内容仍保留。');
  }
  function askTitle(action, value, meta = {}) {
    setError('');
    showDialog({ action, value: value || '', meta });
  }
  function showDialog(value) {
    const current = document.activeElement;
    dialogTrigger.current = current?.closest('details')?.querySelector('summary') ?? current;
    setDialog(value);
  }
  async function submitTitle(event) {
    event.preventDefault();
    const value = dialog?.value.trim();
    if (!value) return;
    await withEditorLocked(async () => {
      setError('');
      const { action, meta } = dialog;
      if (action === 'confirmTrash') {
        if (meta.id === currentId.current) await doSave(true);
        await api('writing.trash', { id: meta.id });
        if (meta.id === currentId.current) installDocument(null);
        if (meta.id === preview?.id) {
          previewRequest.current++;
          setPreview(null);
        }
        await reload(selectedWork);
      } else if (action === 'confirmHistory') {
        await doSave(true);
        installDocument(await api('writing.restoreHistory', {
          id: activeId, revision: meta.revision, expectedRevision: baseRevision.current
        }));
        setHistoryItems(await api('writing.history', { id: activeId }));
      } else if (action === 'createWork') {
        await doSave(true);
        const { id } = await api('writing.createWork', { title: value });
        const next = await api('writing.list', { workId: id });
        const first = orderedChapters(next.volumes, next.docs)[0];
        const opened = first ? await api('writing.open', { id: first.id }) : null;
        focusNewDocument.current = Boolean(opened);
        installDocument(opened);
        setListing(next);
        setSelectedWork(id);
        setInBookshelf(false);
        setSearchText('');
        setBodySearch(null);
        closeToolPanel();
      } else if (action === 'createDoc') {
        await doSave(true);
        const { id } = await api('writing.createDoc', { workId: selectedWork, ...meta, title: value });
        const opened = await api('writing.open', { id });
        focusNewDocument.current = true;
        installDocument(opened);
        if (opened.kind !== 'chapter') {
          previewRequest.current++;
          setPreview(opened);
        }
        await reload(selectedWork);
      } else {
        if (action === 'createVolume') await api('writing.createVolume', { workId: selectedWork, title: value });
        if (action === 'rename') await api('writing.rename', { ...meta, title: value });
        await reload(selectedWork);
      }
      setDialog(null);
    });
  }
  function createWork() { askTitle('createWork'); }
  function createVolume() { if(selectedWork)askTitle('createVolume'); }
  function createDoc(kind, volumeId=null) {
    if (selectedWork) askTitle('createDoc', kind === 'chapter' ? `第${chapters.length + 1}章` : '',
      { kind, volumeId: kind === 'chapter' ? volumeId : null });
  }
  function rename(kind,id,current) { askTitle('rename',current,{kind,id}); }
  async function move(kind,id,direction) { try{await api('writing.move',{kind,id,direction});await reload(selectedWork);}catch(e){setError(e.message);} }
  async function trash(id) { showDialog({action:'confirmTrash',value:'移入回收站后仍可在回收站恢复。',meta:{id}}); }
  async function restore(id) { try{await api('writing.restore',{id});await reload(selectedWork);}catch(e){setError(e.message);} }
  async function importTxt(volumeId = doc?.volume_id ?? volumes[0]?.id) {
    if (!selectedWork) return;
    if (!volumeId) return setError('请先创建分卷');
    await withEditorLocked(async () => {
      await doSave(true);
      const result = await api('writing.importTxt', { workId: selectedWork, volumeId });
      if (result?.id) {
        installDocument(await api('writing.open', { id: result.id }));
        await reload(selectedWork);
      }
    }, 'TXT 导入失败');
  }
  async function exportTxt(id = activeId) {
    try {
      if (!id) await doSave(false);
      await api('writing.exportTxt', id ? { id, draftText: id === currentId.current && dirty.current ? textRef.current : undefined } : { workId: selectedWork });
    } catch (error) { setError(error.message || 'TXT 导出失败'); }
  }
  function find() {
    if (viewRef.current) openSearchPanel(viewRef.current);
  }
  async function addMark(markId) {
    const selection = viewRef.current?.state.selection.main;
    if (!selection || selection.empty) return;
    await withEditorLocked(async () => {
      await doSave(true);
      const previous = marks.find(mark => mark.id === markId);
      const next = await api('writing.addMark', {
        id: activeId, expectedRevision: baseRevision.current, start: selection.from, end: selection.to,
        type: previous?.type ?? markType, note: previous?.note ?? markNote, markId
      });
      setMarks(next || []);
      setMarkNote('');
    }, '标记失败');
  }
  async function deleteMark(markId) {
    await withEditorLocked(async () => {
      await doSave(false);
      setMarks(await api('writing.deleteMark', { id: activeId, markId }));
    });
  }
  async function jumpToMark(id) {
    await withEditorLocked(async () => {
      const saved = await doSave(true);
      const mark = saved?.marks?.find(item => item.id === id);
      const view = viewRef.current;
      if (!view || !mark || mark.invalid || mark.end > view.state.doc.length) {
        setError('标记位置已变化，请重新选择正文。');
        return;
      }
      view.dispatch({ selection: { anchor: mark.start, head: mark.end }, scrollIntoView: true });
      view.focus();
    }, '无法定位标记');
  }
  async function restoreHistory(item) { showDialog({action:'confirmHistory',value:'当前章节会恢复为所选版本；当前内容会先保存。',meta:{revision:item.revision}}); }
  function openToolPanel(panel) {
    previewRequest.current++;
    drawerTrigger.current = document.activeElement;
    focusDrawer.current = false;
    if (panel !== 'body-search') invalidateBodySearch();
    setToolPanel(current => current === panel ? null : panel);
  }
  function closeToolPanel(restoreFocus = false) {
    previewRequest.current++;
    invalidateBodySearch();
    setToolPanel(null);
    focusDrawer.current = false;
    if (restoreFocus) {
      if (drawerTrigger.current?.isConnected && drawerTrigger.current.getClientRects().length) drawerTrigger.current.focus();
      else viewRef.current?.focus();
    }
    drawerTrigger.current = null;
  }
  function invalidateBodySearch() {
    searchRequest.current++;
    setBodySearch(current => current?.loading ? null : current);
  }
  function openBodySearch(query) {
    if (query) {
      invalidateBodySearch();
      setSearchText(query.slice(0, 250));
      setBodySearch(null);
    }
    openToolPanel('body-search');
  }
  async function searchManuscript(event) {
    event.preventDefault();
    const query = searchText.trim();
    if (!query || !selectedWork) return;
    const request = ++searchRequest.current;
    setBodySearch({ query, loading: true });
    try {
      await doSave(false);
      const results = await api('writing.searchWork', { workId: selectedWork, query });
      if (request === searchRequest.current) setBodySearch({ query, results });
    } catch (failure) {
      if (request === searchRequest.current) setBodySearch({ query, error: failure.message || '无法搜索正文' });
    }
  }
  function toggleResource(kind, event) {
    const panel = ['reference','assistant'].includes(kind) ? kind : 'material';
    if (toolPanel === panel && (panel !== 'material' || resourceKind === kind)) {
      closeToolPanel();
      return;
    }
    drawerTrigger.current = event.currentTarget;
    focusDrawer.current = event.detail === 0;
    previewRequest.current++;
    invalidateBodySearch();
    if (panel === 'material') {
      setResourceKind(kind);
      setPreview(null);
    }
    setToolPanel(panel);
  }
  async function previewMaterial(item) {
    const request = ++previewRequest.current;
    const menu = document.activeElement?.closest('.tree-actions details');
    if (menu) drawerTrigger.current = menu.querySelector('summary');
    invalidateBodySearch();
    setResourceKind(item.kind);
    setPreview({ ...item, loading: true });
    setToolPanel('material');
    try {
      const result = item.id === currentId.current
        ? { ...item, text: textRef.current }
        : await api('writing.preview', { id: item.id });
      if (previewRequest.current === request) setPreview(result);
    } catch (error) {
      if (previewRequest.current === request) setPreview({ ...item, error: error.message || '资料读取失败' });
    }
  }
  const activeWork = listing.works.find(w=>w.id===selectedWork);
  const activeVolume = listing.volumes.find(v=>v.id===doc?.volume_id);
  const liveTitle = listing.docs.find(item => item.id === doc?.id)?.title ?? doc?.title;
  const isReference = ['reference','assistant'].includes(toolPanel);
  const dockPanel = wideWindow && !focusMode && Boolean(toolPanel);
  const showResourceTools = !focusMode;
  useEffect(() => { viewRef.current?.requestMeasure(); }, [dockPanel, railTarget, focusMode, preferences]);

  function documentActions(item) {
    return [
      ['上移', () => move('doc', item.id, -1)],
      ['下移', () => move('doc', item.id, 1)],
      ['重命名', () => rename('doc', item.id, item.title)],
      ['回收', () => trash(item.id), '回收']
    ];
  }
  function documentRow(item) {
    const actions = [['在侧栏对照', () => previewMaterial(item)], ...documentActions(item)];
    return <div key={item.id} className={`tree-row doc-row ${activeId === item.id ? 'active' : ''}`}>
      <button className="doc-title" aria-current={activeId === item.id ? 'true' : undefined}
        title={item.title} disabled={transitioning} onClick={() => openDoc(item.id)}>{item.title}</button>
      <div className="tree-actions"><ActionMenu label={item.title} actions={actions} /></div>
    </div>;
  }
  function trashFor(kind) {
    const deleted = listing.docs.filter(item => item.kind === kind && item.deleted);
    if (!deleted.length) return null;
    return <details className="trash-list" key={kind}><summary>回收站</summary>
      <div className="trash-items">{deleted.map(item => <div key={item.id}>
        <span title={item.title}>{item.title}</span><button onClick={() => restore(item.id)}>恢复</button>
      </div>)}</div>
    </details>;
  }
  const rail = !inBookshelf && !focusMode && <aside className="writing-rail" aria-label="卷章">
    <ManuscriptDirectory workId={selectedWork} volumes={volumes} docs={listing.docs}
      activeId={activeId} transitioning={transitioning} renderDocument={documentRow} ActionMenu={ActionMenu}
      onCreateVolume={createVolume} onCreateChapter={id => createDoc('chapter', id)} onImportVolume={importTxt}
      onMoveVolume={(id, direction) => move('volume', id, direction)}
      onRenameVolume={(id, title) => rename('volume', id, title)} onSearchManuscript={openBodySearch}
      collapsed={collapsed[selectedWork] ?? []} onToggleVolume={id => {
        session.current = toggleCollapsedVolume(session.current, selectedWork, id);
        persistSession();
        setCollapsed(session.current.collapsed);
      }} />
    {trashFor('chapter')}
  </aside>;
  const panelTitle = {
    marks: '原创标记', history: '章节历史', preferences: '写作设置',
    material: resourceKind === 'chapter' ? '章节对照' : `${WORK_SECTIONS[resourceKind].label}速查`,
    'body-search': '全书正文搜索', reference: '参考检索侧栏', assistant:'创作助手侧栏'
  }[toolPanel];
  const panelContent = toolPanel === 'preferences'
    ? <WritingPreferences preferences={preferences} update={updatePreferences} />
    : toolPanel === 'material'
    ? <WritingResources key={selectedWork} kind={resourceKind} documents={resourceKind === 'chapter'
      ? chapters.map(item => ({ ...item, volumeTitle: volumes.find(volume => volume.id === item.volume_id)?.title }))
      : liveDocs.filter(item => item.kind === resourceKind)}
      preview={preview?.id === activeId ? { ...preview, text: textRef.current } : preview}
      activeId={activeId} transitioning={transitioning} onPreview={previewMaterial} onOpen={openDoc} onCreate={createDoc}
      renderActions={item => <ActionMenu label={item.title} actions={documentActions(item)} />}
      trash={resourceKind !== 'chapter' ? trashFor(resourceKind) : null} />
    : toolPanel === 'body-search'
    ? <section className="body-search">
      <form onSubmit={searchManuscript}>
        <input type="search" aria-label="正文关键词" placeholder="输入要找的原句或关键词" autoFocus maxLength={250}
          value={searchText} onChange={event => {
            invalidateBodySearch();
            setSearchText(event.target.value);
            setBodySearch(null);
          }} />
        <button type="submit" disabled={!searchText.trim() || bodySearch?.loading || transitioning}>搜索</button>
      </form>
      {!bodySearch && <p>查找当前作品的章节正文。卷名和章名可在左侧目录筛选。</p>}
      {bodySearch?.loading && <p role="status">正在搜索…</p>}
      {bodySearch?.error && <p role="alert">{bodySearch.error}</p>}
      {bodySearch?.results && <>
        <p role="status">{bodySearch.results.length ? `${bodySearch.results.length} 个匹配章节${bodySearch.results.length === 60 ? '（最多显示 60 章）' : ''}` : '没有找到匹配的章节。'}</p>
        <ul>{bodySearch.results.map(result => <li key={result.id}>
          <button className="body-search-result" type="button" disabled={transitioning}
            onClick={() => openDoc(result.id, { query: bodySearch.query, offset: result.offset })}>
            <strong>{result.title}</strong><small>{result.volumeTitle}</small><span>{result.excerpt}</span>
          </button>
        </li>)}</ul>
      </>}
    </section>
    : toolPanel === 'marks'
    ? <section className="mark-panel"><div className="mark-create"><label>标记类型<select value={markType} onChange={e=>setMarkType(e.target.value)}>{MARK_TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label><input aria-label="标记备注" placeholder="备注（可选）" value={markNote} onChange={e=>setMarkNote(e.target.value)}/><button className="primary-button" disabled={!selectedText} onClick={()=>addMark()}>标记所选文字</button><small>{selectedText?'已选中文字可创建标记':'在正文中选中文字后创建标记'}</small></div><ul className="mark-list">{marks.map(m=><li key={m.id} className={m.invalid?'invalid':''}><button className="mark-jump" disabled={m.invalid} title={m.invalid?'标记已失效，请重新选择定位':'跳转到标记位置'} onClick={()=>jumpToMark(m.id)}><b>{MARK_TYPES.find(x=>x.value===m.type)?.label||m.type}{m.invalid?' · 失效':''}</b><span>{m.quote||m.note||'定位标记'}</span></button>{m.invalid&&<button className="quiet-button" onClick={()=>{const v=viewRef.current;if(v){const sel=v.state.selection.main;if(!sel.empty)addMark(m.id);else{setError('请先在正文中重新选中这条标记对应的文字。');v.focus();}}}}>重选</button>}<button className="quiet-button" aria-label="删除标记" onClick={()=>deleteMark(m.id)}>×</button></li>)}</ul></section>
    : <section className="history-panel">
      {historyPreview ? <div className="history-preview-view">
        <div className="history-preview-bar">
          <button type="button" onClick={() => setHistoryPreview(null)}>返回列表</button>
          <button type="button" className="history-restore-button" onClick={() => restoreHistory(historyPreview)}>恢复此版本</button>
        </div>
        <div className="history-preview-meta">
          <span>{new Date(historyPreview.saved).toLocaleString()}</span>
          <span>{wordCount(historyPreview.text).toLocaleString()} 字（{formatHistoryDelta(wordCount(historyPreview.text) - liveWordCount)} 字）</span>
        </div>
        <pre className="history-preview-body" tabIndex={0} aria-label="历史版本正文预览">{historyPreview.text || '（此版本为空白）'}</pre>
      </div> : historyItems.length ? <>
        <ul className="history-list">{historyItems.slice(0, historyLimit).map(item => {
          const words = wordCount(item.text);
          const delta = words - liveWordCount;
          return <li key={item.revision}>
            <button type="button" className="history-item-button" onClick={() => setHistoryPreview(item)}>
              <span className="history-item-time">{new Date(item.saved).toLocaleString()}</span>
              <span className="history-item-stats">{words.toLocaleString()} 字 · {formatHistoryDelta(delta)} 字</span>
            </button>
          </li>;
        })}</ul>
        {historyItems.length > historyLimit && <button type="button" className="history-more"
          onClick={() => setHistoryLimit(limit => limit + 20)}>显示更多（剩余 {historyItems.length - historyLimit} 条）</button>}
      </> : <p className="panel-empty">当前章节还没有历史版本。</p>}
    </section>;
  const drawer = !focusMode && toolPanel && <aside ref={drawerRef} className={`writing-drawer ${dockPanel?'is-docked':''} ${isReference?'is-reference':''}`}
    aria-label={panelTitle} onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented) {
        event.preventDefault();
        closeToolPanel(true);
      }
    }}>
    {toolPanel==='assistant' ? renderAssistant(()=>closeToolPanel(true),selectedWork) : isReference ? renderReference(() => closeToolPanel(true)) :
      <><header className="drawer-head"><strong>{panelTitle}</strong><button className="icon-button" aria-label="关闭侧栏" onClick={() => closeToolPanel(true)}>×</button></header><div className="drawer-content">{panelContent}</div></>}
  </aside>;
  const inlineRail = railTarget ? null : rail;
  const expandButton = doc?.kind === 'chapter' && <>
    <button type="button"
      className={canExpand ? 'writing-expand-button is-ready' : 'writing-expand-button'}
      disabled={!canExpand || transitioning || isPreviewing}
      title={canExpand ? '预览所选括号提示的扩写' : '先选中一对括号中的提示'}
      onMouseDown={event => event.preventDefault()} onClick={openExpansion}>AI 扩写</button>
    {!canExpand && !isPreviewing && enclosingPrompt && <button type="button"
      className="writing-select-prompt-button"
      disabled={transitioning}
      title={`选中括号内提示（${enclosingPrompt.prompt.slice(0, 24)}）`}
      onMouseDown={event => event.preventDefault()} onClick={selectEnclosingPrompt}>选中提示</button>}
  </>;
  const breadcrumbText = focusMode
    ? '专注写作'
    : `${activeWork?.title ?? ''}${doc ? ` / ${activeVolume?.title ?? WORK_SECTIONS[doc.kind].label}` : ''}`;
  const moreGroups = [
    ...(doc ? [{
      key: 'doc',
      heading: '本章',
      items: [
        ...(!isPreviewing ? [['一键整理', () => formatBody(viewRef.current), '清理行尾空格和连续空行，可撤销（Ctrl+K）']] : []),
        ['重命名', () => rename('doc', doc.id, liveTitle)],
        [doc.kind === 'chapter' ? '导出本章' : '导出文档', () => exportTxt(activeId)]
      ]
    }] : []),
    ...(activeWork ? [{
      key: 'work',
      heading: '作品',
      items: [
        ['导入 TXT', importTxt],
        ['导出整书 TXT', () => exportTxt(null)],
        ['重命名作品', () => rename('work', activeWork.id, activeWork.title)]
      ]
    }] : []),
    {
      key: 'view',
      heading: '视图与工具',
      className: 'toolbar-overflow-only',
      items: [
        ['查找替换', find, '查找替换', !doc || isPreviewing],
        ['写作设置', () => openToolPanel('preferences')],
        ['专注', () => {
          if (viewRef.current) closeSearchPanel(viewRef.current);
          setFocusMode(true);
        }]
      ]
    }
  ];
  const canvas = <div ref={shellRef} hidden={inBookshelf} className={`writing-shell ${focusMode?'is-focused':''} ${dockPanel?'has-docked-panel':''} ${toolPanel && !isReference ? 'has-work-panel' : ''} ${inlineRail?'has-inline-rail':''} ${showResourceTools?'has-resource-tools':''}`}>
    {inlineRail}
    <section className="writing-main">
      <header className="writing-toolbar"><div className="toolbar-inner">
        <div className="doc-heading">
          {!focusMode && <button className="writing-back-to-shelf" type="button" aria-label="返回书架" disabled={transitioning}
            onClick={returnToBookshelf}><span aria-hidden="true">‹</span>书架</button>}
          <span className="writing-breadcrumb" title={breadcrumbText}>{breadcrumbText}</span>
          {doc?.recovered && <em>已恢复草稿</em>}
        </div>
        {focusMode ? <div className="writing-focus-actions">
          {expandButton}<button className="focus-exit" onClick={() => setFocusMode(false)}>
            退出专注 <kbd aria-hidden="true">Esc</kbd>
          </button>
        </div> : <div className="toolbar-buttons">
          <div className="edit-history-buttons">
            <button type="button" aria-label="撤销" title="撤销（Ctrl+Z）" disabled={!undoState.undo || transitioning || isPreviewing}
              onClick={() => { const view = viewRef.current; if (view) { undo(view); view.focus(); } }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6 4 11l5 5M4 11h10a5 5 0 0 1 5 5v2" /></svg>
            </button>
            <button type="button" aria-label="重做" title="重做（Ctrl+Y）" disabled={!undoState.redo || transitioning || isPreviewing}
              onClick={() => { const view = viewRef.current; if (view) { redo(view); view.focus(); } }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 6 5 5-5 5m5-5H10a5 5 0 0 0-5 5v2" /></svg>
            </button>
          </div>
          {expandButton}
          <button disabled={!doc || isPreviewing} aria-label="标记" aria-pressed={toolPanel === 'marks'} onClick={() => openToolPanel('marks')}>标记{marks.some(mark => mark.invalid) && <i>{marks.filter(mark => mark.invalid).length}</i>}</button>
          <button disabled={!doc} aria-pressed={toolPanel === 'history'} onClick={() => openToolPanel('history')}>历史</button>
          <button className="toolbar-secondary" disabled={!doc || isPreviewing} onClick={find}>查找替换</button>
          <button className="toolbar-secondary writing-settings-button" aria-pressed={toolPanel === 'preferences'} onClick={() => openToolPanel('preferences')}>写作设置</button>
          <button className="toolbar-secondary writing-focus-button" onClick={() => {
            if (viewRef.current) closeSearchPanel(viewRef.current);
            setFocusMode(true);
          }}>专注</button>
          {(activeWork || doc) && <ActionMenu label="更多" summaryLabel="更多" caption="更多" groups={moreGroups} />}
        </div>}
      </div></header>
      {error&&<div className="writing-error"><span>{error}</span>{dirty.current&&<button onClick={()=>{void doSave(true).catch(()=>{});}}>重试保存</button>}<button onClick={() => exportTxt(activeId)}>导出当前 TXT</button><button onClick={()=>setError('')}>关闭</button></div>}
      {!doc ? <div className="writing-empty"><div>
        <Icon name="edit" size={28} />
        <h2>{transitioning ? '正在打开工作台' : '开始写作'}</h2>
        <p>选择作品中的章节或新建一章。内容会在输入停止后自动保存。</p>
      </div></div> : <div className="editor-stage" aria-busy={transitioning}><div className="editor-column">
        <h1 className="document-title">{liveTitle}</h1>
        <div className="editor-body">
          <div className="editor-host editor-manuscript" inert={isPreviewing} ref={viewHost} />
          {expansionReview && <InlineExpansionPreview review={expansionReview}
            onKeep={applyExpansion} onRestore={() => closeExpansion()}
            onRegenerate={() => setExpansion({ ...expansion, review: null })} />}
        </div>
        <footer className="editor-footer">
          <span className="chapter-count">{liveWordCount.toLocaleString()} 字</span>
          <div className="chapter-navigation">
            {!focusMode && chapterIndex >= 0 ? <>
              <button type="button" aria-label="上一章" title={previousChapter?.title ?? '已是第一章'} disabled={!previousChapter || transitioning}
                onClick={() => openDoc(previousChapter.id)}>‹</button>
              <span aria-label={`第 ${chapterIndex + 1} 章，共 ${chapters.length} 章`}>{chapterIndex + 1} / {chapters.length} 章</span>
              <button type="button" aria-label="下一章" title={nextChapter?.title ?? '已是最后一章'} disabled={!nextChapter || transitioning}
                onClick={() => openDoc(nextChapter.id)}>›</button>
            </> : <span>{WORK_SECTIONS[doc.kind].label}</span>}
          </div>
          <span className="editor-save-state" role="status"><i className={dirty.current || saving ? 'is-pending' : ''} />
            {formatStatus || (saving ? '正在保存' : status || (dirty.current ? '未保存' : '已保存'))}
          </span>
        </footer>
      </div></div>}
    </section>
    {drawer && !dockPanel && <button type="button" className="writing-overlay-dismiss" aria-label="返回正文"
      onClick={() => closeToolPanel(true)} />}
    {drawer}
    {showResourceTools && <WritingResourceTools activeKind={isReference ? toolPanel : toolPanel === 'material' ? resourceKind : null}
      onSelect={toggleResource} hasWork={Boolean(selectedWork)} />}
    {expansion && !expansionReview && <ExpansionDialog api={api} snapshot={expansion} onPreview={previewExpansion}
      onClose={() => closeExpansion()}
      onOpenSettings={onExpansionSettings && (() => { closeExpansion(false); onExpansionSettings(); })} />}
  </div>;
  const titleDialog = dialog && <div className="writing-dialog-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget && !transitioning) setDialog(null);
    }}>
      <form ref={dialogRef} tabIndex={-1} className="writing-dialog" role={dialog.action.startsWith('confirm') ? 'alertdialog' : 'dialog'} aria-labelledby="writing-dialog-title"
        aria-modal="true" onSubmit={submitTitle} onKeyDown={event => {
          if (event.key === 'Escape' && !event.nativeEvent.isComposing && !transitioning) setDialog(null);
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll('input:not(:disabled), button:not(:disabled)');
          const first = controls[0], last = controls[controls.length - 1];
          if (!first || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
            event.preventDefault();
            (event.shiftKey ? last ?? event.currentTarget : first ?? event.currentTarget).focus();
          }
        }}>
        <label id="writing-dialog-title" htmlFor="writing-title">{{
          confirmTrash: '确认移入回收站？', confirmHistory: '确认恢复历史版本？', rename: '重命名',
          createWork: '新建作品', createVolume: '新建分卷', createDoc: WORK_SECTIONS[dialog.meta.kind]?.create ?? '新建章节'
        }[dialog.action]}</label>
        {dialog.action.startsWith('confirm') ? <p>{dialog.value}</p> :
          <input id="writing-title" maxLength={250} value={dialog.value} disabled={transitioning}
            onChange={event => setDialog({ ...dialog, value: event.target.value })} />}
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div>
          <button type="button" disabled={transitioning} onClick={() => setDialog(null)}>取消</button>
          <button type="submit" className="dialog-primary" disabled={transitioning || !dialog.value.trim()}>
            {dialog.action === 'confirmTrash' ? '移入回收站' : dialog.action === 'confirmHistory' ? '恢复历史版本' : '确定'}
          </button>
        </div>
      </form>
    </div>;
  return <>
    {railTarget && rail && createPortal(rail, railTarget)}
    {inBookshelf && <div className="writing-shelf-host" ref={shelfHost}>
      <OriginalBookshelf works={listing.works} selected={selectedWork ?? session.current.recent?.workId}
        busy={transitioning} error={dialog ? '' : error} onSelect={chooseWork} onCreate={createWork} />
    </div>}
    {canvas}
    {titleDialog}
  </>;
}
