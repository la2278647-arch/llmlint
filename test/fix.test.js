'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { checkDocument, fixDocument, FIXABLE, RULES } from '../src/index.js';

const NL = String.fromCharCode(10);
const TR = 'trailing-space';
const CJ = 'cjk-spacing';
const FN = 'no-final-newline';
const names = function (fixes) { return fixes.map(function (f) { return f.rule; }); };
const BT = String.fromCharCode(96);

test('FIXABLE 恰好三条且都在规则表里', () => {
  assert.deepEqual(FIXABLE, [TR, CJ, FN]);
  const ids = RULES.map(function (r) { return r.id; });
  for (const one of FIXABLE) assert.ok(ids.indexOf(one) !== -1, one);
});

test('行尾空格：逐行修剪，空白行不动', () => {
  const src = '标题  ' + NL + '' + NL + '- 条目 \t' + NL;
  const r = fixDocument(src);
  assert.equal(r.fixes.length, 1);
  assert.equal(r.fixes[0].rule, TR);
  assert.equal(r.fixes[0].count, 2);
  assert.equal(r.text, '标题' + NL + '' + NL + '- 条目' + NL);
});

test('中英文缺空格：相邻边界一次全部补齐', () => {
  const r = fixDocument('这是AI生成的Markdown文档。' + NL);
  assert.deepEqual(names(r.fixes), [CJ]);
  assert.equal(r.fixes[0].count, 4);
  assert.equal(r.text, '这是 AI 生成的 Markdown 文档。' + NL);
});

test('数字夹在中文之间：两侧都补空格', () => {
  const r = fixDocument('中文3中文');
  assert.deepEqual(names(r.fixes), [CJ, FN]);
  assert.equal(r.fixes[0].count, 2);
  assert.equal(r.text, '中文 3 中文' + NL);
});

test('代码块与行内代码不被改动', () => {
  const src = BT + BT + BT + 'python' + NL + 'print(' + BT + '中文AI' + BT + ')' + NL + BT + BT + BT + NL + '看 ' + BT + '中文AI' + BT + ' 这里。' + NL;
  const r = fixDocument(src);
  assert.deepEqual(r.fixes, []);
  assert.equal(r.text, src);
});

test('CRLF 文本：只修剪行尾空白，保留 CRLF', () => {
  const cr = String.fromCharCode(13);
  const src = '标题  ' + cr + NL + '正文' + cr + NL;
  const r = fixDocument(src);
  assert.equal(r.fixes[0].rule, TR);
  assert.equal(r.text, '标题' + cr + NL + '正文' + cr + NL);
});

test('文件末尾缺换行：补一个换行', () => {
  const r = fixDocument('只有正文没有换行');
  assert.deepEqual(names(r.fixes), [FN]);
  assert.equal(r.text, '只有正文没有换行' + NL);
});

test('空字符串不补换行', () => {
  const r = fixDocument('');
  assert.deepEqual(r.fixes, []);
  assert.equal(r.text, '');
});

test('已是干净文本：不改动、不报告修复', () => {
  const src = '这是 AI 生成的 Markdown 文档。' + NL;
  const r = fixDocument(src);
  assert.deepEqual(r.fixes, []);
  assert.equal(r.text, src);
});

test('修复可重入：跑两遍等价于一遍', () => {
  const once = fixDocument('中文AI   ' + NL + '再来 中文AI。');
  const twice = fixDocument(once.text);
  assert.deepEqual(twice.fixes, []);
  assert.equal(twice.text, once.text);
});

test('修复后对应规则不再报告', () => {
  const src = '中文AI生成的   ' + NL + '文档。';
  const before = checkDocument(src);
  assert.ok(before.findings.some(function (f) { return f.rule === CJ; }));
  assert.ok(before.findings.some(function (f) { return f.rule === TR; }));
  const after = checkDocument(fixDocument(src).text);
  assert.equal(after.findings.filter(function (f) { return f.rule === CJ || f.rule === TR; }).length, 0);
});

test('支持 disable / enable 过滤可修复规则', () => {
  const src = '中文AI  ' + NL + '结束';
  assert.deepEqual(names(fixDocument(src, { disable: [TR, FN] }).fixes), [CJ]);
  assert.deepEqual(names(fixDocument(src, { enable: [FN] }).fixes), [FN]);
});

test('示例文件 examples/fix-target.md 能被修到 100 分', () => {
  const src = readFileSync('examples/fix-target.md', 'utf8');
  const before = checkDocument(src);
  const fx = fixDocument(src);
  const after = checkDocument(fx.text);
  assert.ok(before.findings.length > 0);
  assert.equal(after.score.score, 100);
  assert.equal(after.score.grade, 'A');
  assert.equal(after.findings.length, 0);
  assert.equal(fx.fixes.length, 3);
});

test('CLI --fix 就地修改文件并报告修复项', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, '中文AI写作   ' + NL + '这是正文说明。');
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(f, 'utf8'), '中文 AI 写作' + NL + '这是正文说明。' + NL);
  assert.match(r.stdout, /已修复/);
  assert.match(r.stdout, /trailing-space/);
  assert.match(r.stdout, /cjk-spacing/);
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('CLI --fix 对 - 从标准输入读取并直接输出修复结果', () => {
  const r = execFileSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', '-'], { input: '中文AI   ' + NL, encoding: 'utf8' });
  assert.equal(r.replace(/\s+$/, ''), '中文 AI');
});

test('CLI --fix 退出码：仍有不可修复的 error 时为 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, '这是一个 ** 未闭合的粗体标记   ' + NL);
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', f], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('CLI --fix 与 -o 组合：源码就地修复，报告写入文件', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  const o = join(dir, 'r.json');
  writeFileSync(f, '中文AI   ' + NL);
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', '--format', 'json', '-o', o, f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /报告已写入/);
  assert.ok(existsSync(o));
  const rep = JSON.parse(readFileSync(o, 'utf8'));
  assert.equal(rep.score.score, 100);
  assert.equal(rep.fixes.length, 2);
  assert.equal(rep.findings.length, 0);
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('CLI 未知选项仍报错退出 1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, 'x' + NL);
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--nonsense', f], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('stats 在可修复规则上正常统计', () => {
  const res = checkDocument('中文AI   ' + NL);
  assert.equal(typeof res.stats[CJ], 'number');
  assert.ok(res.stats[CJ] > 0);
  assert.ok(res.stats[TR] > 0);
});

test('fixDocument 返回对象形状稳定', () => {
  const r = fixDocument('中文AI   ' + NL);
  assert.deepEqual(Object.keys(r).sort(), ['fixes', 'text']);
  for (const x of r.fixes) assert.deepEqual(Object.keys(x).sort(), ['count', 'rule']);
  for (const x of r.fixes) assert.ok(x.count > 0);
});
test('CLI --dry-run 不改写磁盘，只报告将修什么', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  const before = '中文AI   ' + NL + '正文';
  writeFileSync(f, before);
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', '--dry-run', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /将修复（未写入）/);
  assert.match(r.stdout, /cjk-spacing/);
  assert.match(r.stdout, /no-final-newline/);
  assert.equal(readFileSync(f, 'utf8'), before, '磁盘内容必须保持原样');
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('CLI --dry-run 对 - 不向标准输出写修复后的正文', () => {
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', '--dry-run', '-'], { input: '中文AI   ' + NL, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /将修复（未写入）/);
  assert.ok(r.stdout.indexOf('中文 AI') === -1, 'dry-run 不应输出修复后的正文');
});

test('CLI --dry-run 与 --format json 组合：fixes 字段仍在', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  const before = '中文AI   ' + NL;
  writeFileSync(f, before);
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', '--dry-run', '--format', 'json', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.score.score, 100);
  assert.equal(rep.fixes.length, 2);
  assert.equal(readFileSync(f, 'utf8'), before);
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('CLI --dry-run 单独使用不做任何修复', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  const before = '中文AI   ' + NL;
  writeFileSync(f, before);
  const r = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--dry-run', f], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.indexOf('将修复') === -1);
  assert.equal(readFileSync(f, 'utf8'), before);
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('CLI --fix 幂等：连跑两次，第二次内容不再变化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, '中文AI   ' + NL + '再来 中文AI。');
  spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', f], { encoding: 'utf8' });
  const after1 = readFileSync(f, 'utf8');
  const r2 = spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', f], { encoding: 'utf8' });
  assert.equal(readFileSync(f, 'utf8'), after1, '第二次运行不应改动文件');
  assert.ok(r2.stdout.indexOf('已修复') === -1, '第二次不应报告任何修复');
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

test('CLI --fix 处理后 demo-bad.md 的三条可修复规则不再触发', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-fix-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, readFileSync('examples/demo-bad.md', 'utf8'));
  const before = JSON.parse(spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--format', 'json', f], { encoding: 'utf8' }).stdout);
  spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--fix', f], { encoding: 'utf8' });
  const after = JSON.parse(spawnSync(process.execPath, [join('src', 'cli.js'), 'check', '--format', 'json', f], { encoding: 'utf8' }).stdout);
  for (const rule of FIXABLE) {
    assert.equal(after.findings.filter(function (x) { return x.rule === rule; }).length, 0, rule);
  }
  assert.ok(after.score.score > before.score.score, '修复后评分应上升');
  unlinkSync(f);
  rmSync(dir, { recursive: true, force: true });
});

