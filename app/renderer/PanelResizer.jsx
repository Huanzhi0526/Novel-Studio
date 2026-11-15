import React, { useEffect, useRef, useState } from 'react';

export function PanelResizer({ width, min, max, onChange, onCommit }) {
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const clamp = value => Math.round(Math.max(min, Math.min(max, value)));

  useEffect(() => {
    if (!dragging) return;
    const style = document.documentElement.style;
    const cursor = style.cursor, selection = style.userSelect;
    style.cursor = 'col-resize';
    style.userSelect = 'none';
    return () => { style.cursor = cursor; style.userSelect = selection; };
  }, [dragging]);

  function finish(event, cancel = false) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (cancel) onChange(start.width);
    else onCommit(start.latest);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <div className={`writing-panel-resizer ${dragging ? 'is-dragging' : ''}`}
    role="separator" tabIndex={0} aria-label="调整右侧栏宽度" aria-orientation="vertical"
    aria-controls="writing-right-panel" aria-valuemin={min} aria-valuemax={max} aria-valuenow={width}
    aria-valuetext={`${width} 像素`} title="拖动调整侧栏宽度；方向键微调；双击恢复默认"
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { x: event.clientX, width, latest: width, pointerId: event.pointerId };
      setDragging(true);
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (!start || start.pointerId !== event.pointerId) return;
      start.latest = clamp(start.width + start.x - event.clientX);
      onChange(start.latest);
    }}
    onPointerUp={event => finish(event)}
    onPointerCancel={event => finish(event, true)}
    onLostPointerCapture={event => finish(event)}
    onDoubleClick={() => { const next = clamp(364); onChange(next); onCommit(next); }}
    onKeyDown={event => {
      const step = event.shiftKey ? 40 : 10;
      const values = { ArrowLeft: width + step, ArrowRight: width - step, Home: min, End: max };
      if (!(event.key in values)) return;
      event.preventDefault();
      const next = clamp(values[event.key]);
      onChange(next);
      onCommit(next);
    }}
  />;
}
