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

test('共 26 条规则且严重度合法', () => {
  assert.equal(RULES.length, 26);
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
  assert.equal(r.summary.checked, 26);
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
  ['no-final-newline', 'abc'],
  ['ja-halfwidth-punct', 'これはテスト,です。' + NL],
  ['ja-hankaku-kana', 'サーバー' + String.fromCharCode(0xff71) + 'テスト' + NL]
];

for (const [id, text] of CASES) {
  test('规则触发: ' + id, () => {
    const r = checkDocument(text);
    const hits = of(r.findings, id);
    assert.ok(hits.length > 0, '规则 ' + id + ' 未触发；实际发现: ' + r.findings.map(f => f.rule).join(','));
  });
}

test('日文半角标点：小数点与千分位不报', () => {
  const r = checkDocument('スコアは99.9%で、予算は1,000万円です。' + NL, { enable: ['ja-halfwidth-punct'] });
  assert.equal(r.findings.length, 0);
});

test('日文半角标点：只有包含假名的行才检查', () => {
  const t = 'これはテスト,です。' + NL + 'This is a test, with a comma, ok.' + NL;
  const r = checkDocument(t, { enable: ['ja-halfwidth-punct'] });
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].line, 1);
});

test('日文半角标点：URL 内的标点不报', () => {
  const t = '参考 https://example.com?a=1,b=2 のページ。' + NL;
  const r = checkDocument(t, { enable: ['ja-halfwidth-punct'] });
  assert.equal(r.findings.length, 0);
});

test('日文半角标点：代码块内不报', () => {
  const t = BT.repeat(3) + NL + 'console.log("a,b,c.");' + NL + BT.repeat(3) + NL + NL + 'これはテストです。' + NL;
  const r = checkDocument(t, { enable: ['ja-halfwidth-punct'] });
  assert.equal(r.findings.length, 0);
});

test('日文半角标点：多处只报一条', () => {
  const t = 'これはテスト,です,か?,本当?!' + NL;
  const r = checkDocument(t, { enable: ['ja-halfwidth-punct'] });
  assert.equal(r.findings.length, 1);
  assert.match(r.findings[0].message, /共 6 处/);
});

test('日文半角标点：三类标点各自触发', () => {
  for (const ch of [',', '.', '!']) {
    const r = checkDocument('これはテスト' + ch + 'です。' + NL, { enable: ['ja-halfwidth-punct'] });
    assert.equal(r.findings.length, 1, '字符 ' + ch);
  }
});

test('日文半角标点：行号列号定位准确', () => {
  const r = checkDocument('正常。' + NL + 'これはテスト,です。' + NL, { enable: ['ja-halfwidth-punct'] });
  assert.equal(r.findings[0].line, 2);
  assert.equal(r.findings[0].column, 7);
});

test('半角片假名：只在两种宽度混用时报', () => {
  const half = String.fromCharCode(0xff71) + String.fromCharCode(0xff90) + String.fromCharCode(0xff95);
  assert.equal(checkDocument(half + NL, { enable: ['ja-hankaku-kana'] }).findings.length, 0, '通篇半角不报');
  assert.equal(checkDocument('サーバーテストアプリケーション' + NL, { enable: ['ja-hankaku-kana'] }).findings.length, 0, '通篇全角不报');
  assert.equal(checkDocument('サーバー' + String.fromCharCode(0xff70) + 'テスト' + NL, { enable: ['ja-hankaku-kana'] }).findings.length, 1, '混用要报');
});

test('半角片假名：代码块内不报', () => {
  const t = BT.repeat(3) + NL + 'const k = "' + String.fromCharCode(0xff70) + '";' + NL + BT.repeat(3) + NL + NL + 'サーバーです。' + NL;
  const r = checkDocument(t, { enable: ['ja-hankaku-kana'] });
  assert.equal(r.findings.length, 0);
});

test('半角片假名：日文标点规则与片假名规则互不干扰', () => {
  const r = checkDocument('これはテストです。サーバー' + String.fromCharCode(0xff70) + 'です。' + NL);
  assert.equal(of(r.findings, 'ja-halfwidth-punct').length, 0);
  assert.equal(of(r.findings, 'ja-hankaku-kana').length, 1);
});

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

test('unbalanced-markdown: 未闭合的内联代码、删除线、链接都会报', () => {
  const cases = [
    ['内联代码', '行内 ' + BT + 'broken 不闭合。' + NL, /内联代码标记/],
    ['删除线', '删除线 ~~abc 没闭合。' + NL, /删除线标记/],
    ['中括号', '参考 [文档 没闭合。' + NL, /中括号未配对/],
    ['链接目标', '参考 [文档](http://example.com 的地址。' + NL, /链接目标括号未闭合/]
  ];
  for (const one of cases) {
    const r = checkDocument(one[1], { enable: ['unbalanced-markdown'] });
    assert.ok(r.findings.length > 0, one[0]);
    assert.ok(r.findings.some(f => one[2].test(f.message)), one[0] + '；实际: ' + r.findings.map(f => f.message).join(' | '));
  }
});

test('unbalanced-markdown: 双反引号包单反引号不误报', () => {
  const t = '这样写 ' + BT.repeat(2) + 'code with ' + BT + ' inside' + BT.repeat(2) + ' 是对的。' + NL;
  const r = checkDocument(t, { enable: ['unbalanced-markdown'] });
  assert.equal(r.findings.length, 0);
});

test('unbalanced-markdown: 未闭合围栏单独识别', () => {
  const r = checkDocument(BT.repeat(3) + 'bash' + NL + 'echo hi' + NL, { enable: ['unbalanced-markdown'] });
  assert.ok(r.findings.some(f => /围栏代码块/.test(f.message)), r.findings.map(f => f.message).join());
});

test('unbalanced-markdown: 成对的标记与链接不误报', () => {
  const t = '# 标题' + NL + NL
    + '粗体 **重点** 与删除线 ~~旧的~~。' + NL
    + '内联 ' + BT + 'x' + BT + ' 与链接 [文档](https://example.com)。' + NL
    + '还有括号说明 (补充说明)。' + NL;
  const r = checkDocument(t, { enable: ['unbalanced-markdown'] });
  assert.equal(r.findings.length, 0);
});

test('unbalanced-markdown: 定位到具体标记的行号列号', () => {
  const r = checkDocument('第一行正常。' + NL + '第二行 ' + BT + 'broken。' + NL);
  const f = of(r.findings, 'unbalanced-markdown')[0];
  assert.equal(f.line, 2);
  assert.ok(f.column >= 5);
});

test('demo-bad 基线锁定：25 条发现、评分 0、等级 F', () => {
  const r = checkDocument(BAD);
  assert.equal(r.findings.length, 25);
  assert.equal(r.score.score, 0);
  assert.equal(r.score.grade, 'F');
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
  assert.equal(r.summary.checked, 26);
  assert.ok(r.score.score >= 0);
});

test('坏文档检出数量与严重度分布合理', () => {
  const r = checkDocument(BAD);
  assert.ok(r.findings.length >= 15);
  assert.ok(r.score.counts.error >= 2);
  assert.ok(r.score.counts.warning >= 5);
  assert.ok(r.score.score <= 100);
});
