import { Converter } from 'opencc-js';

const simplify = Converter({ from: 't', to: 'cn' });
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const words = /[\p{L}\p{N}]+/gu;

export const categoryLabels = {
  character: '人物', setting: '设定', power_system: '力量体系', organization: '组织',
  event: '事件', storyline: '故事线', location: '地点', item: '物品', technique: '写作技巧'
};

export function normalizeSearch(text) {
  return simplify(text.normalize('NFKC').toLowerCase()).replace(/\s+/g, ' ').trim();
}

export function searchTerms(text) {
  return [...new Set([...segmenter.segment(text)].flatMap(part => part.segment.match(words) ?? []))];
}

export function cardSearchText(card) {
  return normalizeSearch([card.title, ...(card.aliases ?? []), card.content, categoryLabels[card.category]].join(' '));
}
