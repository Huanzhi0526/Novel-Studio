// Repairs only an unambiguous table whose rows were collapsed onto one line.
// Stored messages and code samples remain unchanged.
function cells(row) {
  const result = [];
  let cell = '', ticks = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\' && i + 1 < row.length) { cell += row[i] + row[++i]; continue; }
    if (row[i] === '`') {
      let end = i;
      while (row[end] === '`') end++;
      const length = end - i;
      ticks = ticks === length ? 0 : ticks || length;
      cell += row.slice(i, end); i = end - 1; continue;
    }
    if (row[i] === '|' && ticks) return null;
    if (row[i] === '|' && !ticks) { result.push(cell.trim()); cell = ''; }
    else cell += row[i];
  }
  result.push(cell.trim());
  if (!result[0]) result.shift();
  if (!result.at(-1)) result.pop();
  return result;
}

export function normalizeAssistantMarkdown(text) {
  let fence = null;
  return String(text ?? '').split('\n').map(line => {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return line;
    }
    if (fence || !line.trim().startsWith('|')) return line;
    const rows = line.trim().split(/\|\s+\|/u).map(row => `|${row.replace(/^\||\|$/gu, '').trim()}|`);
    if (rows.length < 3) return line;
    const header = cells(rows[0]), separator = cells(rows[1]);
    if (!header || !separator || header.length < 2 || separator.length !== header.length ||
        !separator.every(cell => /^:?-{3,}:?$/u.test(cell)) ||
        !rows.slice(2).every(row => cells(row)?.length === header.length)) return line;
    return rows.join('\n');
  }).join('\n');
}

function plain(node) {
  return node.value ?? (node.children ?? []).map(plain).join('');
}

// GFM tables containing prose read better as labeled records, especially in a sidebar.
export function readableAssistantTables() {
  return tree => {
    function visit(parent) {
      for (let i = 0; i < (parent.children?.length ?? 0); i++) {
        const node = parent.children[i];
        if (node.type === 'html' && /^<br\s*\/?\s*>$/iu.test(node.value)) {
          parent.children[i] = { type: 'break' };
          continue;
        }
        visit(node);
        if (node.type !== 'table' || !node.children.length) continue;
        const [header, ...rows] = node.children;
        const long = rows.some(row => row.children.some(cell => plain(cell).length > 90)) || plain(node).length > 450;
        if (!long) continue;
        parent.children[i] = {
          type: 'blockquote', data: { hName: 'div', hProperties: { className: 'assistant-table-records' } },
          children: rows.map(row => ({
            type: 'blockquote', data: { hName: 'section', hProperties: { className: 'assistant-table-record' } },
            children: [
              { type: 'heading', depth: 4, children: row.children[0].children },
              ...row.children.slice(1).map((cell, index) => ({
                type: 'paragraph', children: [
                  { type: 'strong', children: [{ type: 'text', value: `${plain(header.children[index + 1])}：` }] },
                  ...cell.children
                ]
              }))
            ]
          }))
        };
      }
    }
    visit(tree);
  };
}
