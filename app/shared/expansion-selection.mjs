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
