export function cardPreview(card) {
  const source = card.creative_takeaway?.trim() || String(card.content ?? '')
    .split(/^\s{0,3}#{1,6}\s*检索标签\s*$/mu)[0]
    .replace(/^\s{0,3}#{1,6}\s+.*$/gmu, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1')
    .replace(/^\s*(?:>\s*|[\-*+]\s+)/gmu, '')
    .replace(/\*\*|__|`/gu, '')
    .replace(/<br\s*\/?\s*>/giu, ' ');
  const text = source.replace(/\s+/gu, ' ').trim();
  const points = [...text];
  return points.length > 160 ? points.slice(0, 160).join('') + '…' : text;
}
