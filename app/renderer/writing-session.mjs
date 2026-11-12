const storageKey = 'studio.writingSession.v1';
const maxPositions = 100;
const maxWorks = 20;
const maxVolumesPerWork = 100;

function validId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizePosition(value) {
  if (!value || typeof value !== 'object') return null;
  const { revision, anchor, head, scrollTop } = value;
  if (!nonnegativeInteger(revision) || !nonnegativeInteger(anchor) || !nonnegativeInteger(head) ||
      !Number.isFinite(scrollTop) || scrollTop < 0) return null;
  return { revision, anchor, head, scrollTop };
}

function entries(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : [];
}

function normalizeSession(value) {
  const { recent, positions, collapsed } = value ?? {};
  return {
    recent: validId(recent?.workId) && validId(recent?.docId) ? { workId: recent.workId, docId: recent.docId } : null,
    positions: Object.fromEntries(entries(positions).flatMap(([id, value]) => {
      const position = normalizePosition(value);
      return validId(id) && position ? [[id, position]] : [];
    }).slice(-maxPositions)),
    collapsed: Object.fromEntries(entries(collapsed).flatMap(([id, value]) => {
      if (!validId(id) || !Array.isArray(value)) return [];
      const volumes = [...new Set(value.filter(validId))].slice(-maxVolumesPerWork);
      return volumes.length ? [[id, volumes]] : [];
    }).slice(-maxWorks))
  };
}

function updateRecentEntry(object, key, value, limit) {
  const items = Object.entries(object).filter(([id]) => id !== key);
  if (value != null) items.push([key, value]);
  return Object.fromEntries(items.slice(-limit));
}

export function readWritingSession(storage) {
  try {
    return normalizeSession(JSON.parse((storage ?? localStorage).getItem(storageKey)));
  } catch {
    return normalizeSession(null);
  }
}

export function writeWritingSession(state, storage) {
  try {
    (storage ?? localStorage).setItem(storageKey, JSON.stringify(normalizeSession(state)));
  } catch {
    // Continue writing if browser storage is unavailable.
  }
}

export function rememberPosition(state, docId, position) {
  const saved = normalizePosition(position);
  if (!validId(docId) || !saved) return state;
  return { ...state, positions: updateRecentEntry(state.positions, docId, saved, maxPositions) };
}

export function matchingPosition(state, docId, revision, textLength) {
  if (!Object.hasOwn(state.positions, docId)) return null;
  const position = normalizePosition(state.positions[docId]);
  if (!position || position.revision !== revision || !nonnegativeInteger(textLength) ||
      position.anchor > textLength || position.head > textLength) return null;
  return position;
}

export function toggleCollapsedVolume(state, workId, volumeId) {
  if (!validId(workId) || !validId(volumeId)) return state;
  const current = Object.hasOwn(state.collapsed, workId) ? state.collapsed[workId] : [];
  const volumes = current.includes(volumeId)
    ? current.filter(id => id !== volumeId)
    : [...current, volumeId].slice(-maxVolumesPerWork);
  return { ...state, collapsed: updateRecentEntry(state.collapsed, workId, volumes.length ? volumes : null, maxWorks) };
}

export function clearWritingSession(storage) {
  try {
    (storage ?? localStorage).removeItem(storageKey);
  } catch {
    // The application can still restore its library.
  }
}
