import React, { useLayoutEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import './card-content.css';

const tones = {
  身份: 'identity', 叙事定位: 'identity', 职业: 'identity',
  性格: 'trait', 动机: 'trait', 主题: 'trait', 叙事效果: 'trait', 适用情境: 'trait',
  关系: 'relation', 归属: 'relation', 权力结构: 'relation', 目标: 'relation',
  能力: 'ability', 机制: 'ability', 职能: 'ability', 效果: 'ability', 手法: 'ability', 用途: 'ability',
  条件: 'cost', 限制: 'cost', 例外: 'cost', 代价: 'cost', 相克: 'cost', 进入条件: 'cost',
  情节机制: 'plot', 冲突: 'plot', 反差: 'plot', 转折: 'plot', 结果: 'plot', 阶段变化: 'plot', 流转: 'plot',
  场景: 'place', 空间: 'place', 适用范围: 'place'
};

function textOf(node) {
  return node.children?.every(child => child.type === 'text')
    ? node.children.map(child => child.value).join('') : null;
}

function markGroup(node, text) {
  const match = /^([^｜\n]{1,20})｜([^\n]+)$/u.exec(text?.trim() ?? '');
  if (!match) return;
  const label = match[1].trim();
  const items = [...new Set(match[2].split(/[、，,]/u).map(item => item.trim()).filter(Boolean))];
  if (!label || !items.length) return;
  node.data = { ...node.data, hProperties: {
    ...node.data?.hProperties, 'data-tag-label': label, 'data-tag-items': JSON.stringify(items)
  } };
}

function tagGroups() {
  return tree => {
    let tags = false;
    for (const node of tree.children) {
      if (node.type === 'heading') tags = textOf(node)?.trim() === '检索标签';
      if (tags && node.type === 'list' && !node.ordered) {
        for (const item of node.children) {
          if (item.children.length === 1 && item.children[0].type === 'paragraph') {
            markGroup(item, textOf(item.children[0]));
          }
        }
      }
      if (node.type === 'paragraph') {
        const text = textOf(node);
        if (text?.trim().startsWith('检索标签｜')) markGroup(node, text);
      }
    }
  };
}

function GroupLine({ node, children, element: Element }) {
  const label = node.properties['data-tag-label'];
  if (!label) return <Element>{children}</Element>;
  const items = JSON.parse(node.properties['data-tag-items']);
  return <Element className="card-tag-group" data-tone={tones[label] ?? 'neutral'}>
    <span className="card-tag-label">{label}</span>
    <span className="card-tag-items">{items.map(item => <span className="card-tag" key={item}>{item}</span>)}</span>
  </Element>;
}

const components = {
  li: props => <GroupLine {...props} element="li" />,
  p: props => <GroupLine {...props} element="p" />
};
const plugins = [tagGroups];
const allowed = ['h2', 'h3', 'p', 'strong', 'ul', 'ol', 'li', 'blockquote', 'br'];

export function CardContent({ content, compact = false }) {
  const body = useRef(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const node = body.current;
    const measure = () => setClipped(compact && node.scrollHeight > node.clientHeight + 1);
    measure();
    if (!compact) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [content, compact]);
  return <div ref={body} className={`card-content${clipped ? ' card-content-clipped' : ''}`}>
    <Markdown allowedElements={allowed} unwrapDisallowed remarkPlugins={plugins} components={components}>
      {content}
    </Markdown>
  </div>;
}
