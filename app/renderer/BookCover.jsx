import React, { useState } from 'react';
import './book-cover.css';

export function BookCover({ title, cover }) {
  const [failed, setFailed] = useState(null);
  return <span className="book-cover" aria-hidden="true">
    <span className="book-cover-title" title={title}>{title}</span>
    {cover && failed !== cover && <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setFailed(cover)} />}
  </span>;
}
