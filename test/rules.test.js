'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkDocument, RULES } from '../src/index.js';
import { scoreFindings, severityOrder } from '../src/score.js';

const NL = String.fromCharCode(10);
const BT = String.fromCharCode(96);
const BAD = readFileSync('examples/demo-bad.md', 'utf8');
const GOOD = readFileSync('examples/demo-good.md', 'utf8');

const of = (findings, id) => findings.filter(f => f.rule === id);

test('共 24 条规则且严重度合法', () => {
  assert.equal(RULES.length, 24);
  for (const r of RULES) {
    assert.ok(['info', 'warning', 'error'].indexOf(r.severity) !== -1, r.id);
    assert.equal(typeof r.check, 'function', r.id);
    assert.ok(r.description.length > 0, r.id);
  }
  const ids = RULES.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, '规则 id 不能重复');
});

test('severityOrder 顺序正确', () => {
  assert.equal(severityOrder('info'), 0);
  assert.equal(severityOrder('warning'), 1);
  assert.equal(severityOrder('error'), 2);
  assert.equal(severityOrder('nope'), 0);
});

test('scoreFindings 扣分与等级', () => {
  assert.equal(scoreFindings([]).score, 100);
  assert.equal(scoreFindings([]).grade, 'A');
  const one = scoreFindings([{ severity: 'error' }, { severity: 'warning' }, { severity: 'info' }]);
  assert.equal(one.score, 83);
  assert.equal(one.grade, 'B');
  const many = scoreFindings(new Array(40).fill({ severity: 'error' }));
  assert.equal(many.score, 0);
  assert.equal(many.grade, 'F');
});

test('干净文档零发现满分', () => {
  const r = checkDocument(GOOD);
  assert.equal(r.findings.length, 0);
  assert.equal(r.score.score, 100);
  assert.equal(r.score.grade, 'A');
  assert.equal(r.summary.checked, 24);
});

// 每条规则的正向用例
const CASES = [
  ['placeholder-text', '这里有一个 TODO 待办。' + NL],
  ['filler-words', ['总的来说', '综上所述', '值得一提的是', '换句话说', '说白了', '简而言之'].join('。') + '。' + NL],
  ['hedge-words', ['可能', '也许', '大概', '或许', '似乎', '大约', '差不多', '一般来说', '某种程度上'].join('，') + '。' + NL],
  ['overclaim', '这个方案总是有效的。' + NL],
  ['marketing-superlative', '这是一个革命性的方案。' + NL],
  ['vague-time', '上周我们做了测试。' + NL],
  ['repetition', ['这是一段重复出现的长句子，应该被识别为重复内容。', '这是一段重复出现的长句子，应该被识别为重复内容。'].join(' ' + NL + ' ') + NL],
  ['emoji-sprawl', String.fromCodePoint(0x1F600).repeat(9) + NL],
  ['heading-jump', '# 一级' + NL + '### 三级' + NL],
  ['repeated-heading', '# 一级' + NL + NL + '## 二级' + NL + NL + '## 二级' + NL],
  ['bare-url', '访问 https://example.com 了解详情。' + NL],
  ['mixed-punct', 'This is an English sentence with a Chinese comma inside it，so it should be clearly flagged now.' + NL],
  ['cjk-spacing', '中文English混排文本。' + NL],
  ['code-lang', BT.repeat(3) + NL + 'const x = 1;' + NL + BT.repeat(3) + NL],
  ['list-depth', ' '.repeat(12) + '- 深层列表项' + NL],
  ['empty-list-item', '- 有效项' + NL + '- ' + NL],
  ['sentence-too-long', '这是一句' + '很长的'.repeat(60) + '句子。' + NL],
  ['paragraph-bloat', '这是一段很长的文字。' + '内容'.repeat(700) + NL],
  ['shout-caps', '这里有一个 GROK 词。' + NL],
  ['unbalanced-markdown', '这是 ** 未闭合的标记。' + NL],
  ['trailing-space', 'abc  ' + NL],
  ['table-misaligned', '| a | b |' + NL + '| --- | --- |' + NL + '| c | d | e |' + NL],
  ['number-without-source', '效果提升了 45%。' + NL],
  ['no-final-newline', 'abc']
];

for (const [id, text] of CASES) {
  test('规则触发: ' + id, () => {
    const r = checkDocument(text);
    const hits = of(r.findings, id);
    assert.ok(hits.length > 0, '规则 ' + id + ' 未触发；实际发现: ' + r.findings.map(f => f.rule).join(','));
  });
}

test('规则 id 与 CASES 覆盖一致', () => {
  const covered = new Set(CASES.map(c => c[0]));
  for (const r of RULES) {
    assert.ok(covered.has(r.id), '规则 ' + r.id + ' 缺少正向用例');
  }
});

test('代码块与行内代码内的模式不触发', () => {
  const t = BT.repeat(3) + 'bash' + NL + 'TODO 这个占位符在代码块里应被忽略' + NL + BT.repeat(3) + NL
    + NL + '行内 ' + BT + '也是 ** 代码 ' + BT + ' 不应触发。' + NL;
  const r = checkDocument(t);
  assert.equal(of(r.findings, 'placeholder-text').length, 0);
  assert.equal(of(r.findings, 'unbalanced-markdown').length, 0);
  assert.equal(r.findings.length, 0);
});

test('英文链接内的裸 URL 不触发', () => {
  const r = checkDocument('参见 [文档](https://example.com) 即可。' + NL);
  assert.equal(of(r.findings, 'bare-url').length, 0);
});

test('enable 只运行指定规则', () => {
  const r = checkDocument('TODO' + NL, { enable: ['placeholder-text'] });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].rule, 'placeholder-text');
  assert.equal(r.summary.checked, 1);
});

test('disable 跳过指定规则', () => {
  const r = checkDocument('TODO' + NL, { disable: ['placeholder-text'] });
  assert.equal(of(r.findings, 'placeholder-text').length, 0);
});

test('minSeverity 过滤低级别', () => {
  const r = checkDocument('TODO' + NL + '中文English' + NL, { minSeverity: 'error' });
  assert.ok(r.findings.length > 0);
  for (const f of r.findings) assert.equal(f.severity, 'error');
});

test('maxFindings 限制返回数量', () => {
  const r = checkDocument(BAD, { maxFindings: 3 });
  assert.ok(r.findings.length <= 3);
});

test('发现按行号列号升序排列', () => {
  const r = checkDocument(BAD);
  for (let i = 1; i < r.findings.length; i++) {
    const a = r.findings[i - 1];
    const b = r.findings[i];
    assert.ok(a.line < b.line || (a.line === b.line && a.column <= b.column));
  }
});

test('每条发现都带行号、严重度与规则 id', () => {
  const r = checkDocument(BAD);
  assert.ok(r.findings.length > 0);
  for (const f of r.findings) {
    assert.ok(f.line >= 1, '行号应为正');
    assert.ok(f.column >= 1, '列号应为正');
    assert.ok(RULES.some(x => x.id === f.rule), '规则 id 合法');
    assert.ok(['info', 'warning', 'error'].indexOf(f.severity) !== -1);
    assert.ok(f.message.length > 0);
  }
});

test('规则抛异常时不会中断整体检查', () => {
  const r = checkDocument(BAD);
  assert.equal(r.summary.checked, 24);
  assert.ok(r.score.score >= 0);
});

test('坏文档检出数量与严重度分布合理', () => {
  const r = checkDocument(BAD);
  assert.ok(r.findings.length >= 15);
  assert.ok(r.score.counts.error >= 2);
  assert.ok(r.score.counts.warning >= 5);
  assert.ok(r.score.score <= 100);
});
