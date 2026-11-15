export const MAX_EXPANSION_PROMPT_LENGTH = 1200;

const closeFor = { '(': ')', '（': '）' };

function parsePair(text, from, to) {
  const close = closeFor[text[from]];
  if (!close || to - from < 3 || text[to - 1] !== close) return null;

  const prompt = text.slice(from + 1, to - 1).trim();
  if (!prompt || prompt.length > MAX_EXPANSION_PROMPT_LENGTH || !prompt.isWellFormed()) return null;

  const stack = [];
  for (const char of prompt) {
    if (closeFor[char]) stack.push(closeFor[char]);
    else if ((char === ')' || char === '）') && stack.pop() !== char) return null;
  }
  return stack.length ? null : { from, to, prompt };
}

export function expansionSelection(text, from, to) {
  if (typeof text !== 'string' || !Number.isSafeInteger(from) || !Number.isSafeInteger(to)
    || from < 0 || from >= to || to > text.length) return null;

  const selected = parsePair(text, from, to);
  if (selected || from === 0 || to === text.length) return selected;
  return parsePair(text, from - 1, to + 1);
}

function splitsSurrogate(text, offset) {
  if (offset <= 0 || offset >= text.length) return false;
  const prev = text.charCodeAt(offset - 1);
  const next = text.charCodeAt(offset);
  return prev >= 0xD800 && prev <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF;
}

export function enclosingExpansionPair(lineText, offset) {
  if (typeof lineText !== 'string' || !Number.isSafeInteger(offset)
    || offset < 0 || offset > lineText.length || splitsSurrogate(lineText, offset)) return null;

  const stack = [];
  for (let i = 0; i < lineText.length; i++) {
    const ch = lineText[i];
    if (closeFor[ch]) {
      stack.push({ from: i, close: closeFor[ch] });
    } else if (ch === ')' || ch === '）') {
      const matchIndex = stack.findLastIndex(entry => entry.close === ch);
      if (matchIndex < 0) {
        stack.length = 0;
        continue;
      }
      const { from } = stack[matchIndex];
      stack.length = matchIndex;
      const to = i + 1;
      if (from + 1 <= offset && offset <= i) {
        const match = parsePair(lineText, from, to);
        if (match) return match;
      }
    }
  }
  return null;
}
