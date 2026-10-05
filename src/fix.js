'use strict';

import { NL, maskCode, scan } from './engine.js';

// 零宽前瞻：匹配本身只占一个字符，避免相邻边界互相吞掉。
const CJK_LATIN_FIX_RE = /([\u4e00-\u9fff])(?=[A-Za-z0-9])|([A-Za-z0-9])(?=[\u4e00-\u9fff])/g;

function fixTrailingSpace(text) {
  const lines = text.split(NL);
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^[ \t]*$/.test(lines[i])) continue;
    const m = lines[i].match(/[ \t]+(?=\r?$)/);
    if (m) { lines[i] = lines[i].slice(0, m.index) + lines[i].slice(m.index + m[0].length); n++; }
  }
  return { text: lines.join(NL), count: n };
}

function fixCjkSpacing(text) {
  const masked = maskCode(text);
  const at = [];
  for (const m of scan(masked, CJK_LATIN_FIX_RE)) at.push(m.index + 1);
  at.sort(function (a, b2) { return b2 - a; });
  let out = text;
  let n = 0;
  for (const p of at) {
    if (out.charAt(p - 1) === ' ' || out.charAt(p) === ' ') continue;
    out = out.slice(0, p) + ' ' + out.slice(p);
    n++;
  }
  return { text: out, count: n };
}

function fixFinalNewline(text) {
  if (text.length === 0 || text.slice(-1) === NL) return { text: text, count: 0 };
  return { text: text + NL, count: 1 };
}

const FIXERS = [
  { id: 'trailing-space', fix: fixTrailingSpace },
  { id: 'cjk-spacing', fix: fixCjkSpacing },
  { id: 'no-final-newline', fix: fixFinalNewline }
];

export const FIXABLE = FIXERS.map(function (f) { return f.id; });

export function fixDocument(text, options) {
  const opts = options || {};
  const disabled = opts.disable || [];
  const enabled = opts.enable || [];
  const fixes = [];
  let out = text;
  for (const f of FIXERS) {
    if (disabled.indexOf(f.id) !== -1) continue;
    if (enabled.length > 0 && enabled.indexOf(f.id) === -1) continue;
    const r = f.fix(out);
    if (r.count > 0) { out = r.text; fixes.push({ rule: f.id, count: r.count }); }
  }
  return { text: out, fixes: fixes };
}
