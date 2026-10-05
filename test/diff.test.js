'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { changedRanges, inRanges, splitFindings, DiffError, inGitWorkTree, prepareDiff, untrackedFiles } from '../src/diff.js';

const NL = String.fromCharCode(10);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'src', 'cli.js');

// ---------- 纯函数 ----------

test('changedRanges: 常规分段头取新文件侧范围', () => {
  assert.deepEqual(changedRanges('@@ -1,3 +1,4 @@ x'), [{ start: 1, end: 4 }]);
});

test('changedRanges: 省略行数的分段头按 1 行算', () => {
  assert.deepEqual(changedRanges('@@ -5 +6 @@ x'), [{ start: 6, end: 6 }]);
});

test('changedRanges: 相邻与重叠的分段合并成一个区间', () => {
  const d = '@@ -1,2 +1,2 @@ a' + NL + '@@ -5,2 +5,2 @@ b' + NL + '@@ -6,3 +6,4 @@ c' + NL;
  assert.deepEqual(changedRanges(d), [{ start: 1, end: 2 }, { start: 5, end: 9 }]);
});

test('changedRanges: 纯删除的分段不产生改动范围', () => {
  assert.deepEqual(changedRanges('@@ -40,3 +40,0 @@ x'), []);
});

test('changedRanges: 非分段行被忽略', () => {
  assert.deepEqual(changedRanges('--- a/x.md' + NL + '+++ b/x.md' + NL + '-旧' + NL + '+新'), []);
});

test('inRanges: 区间含端点，空范围为假', () => {
  const r = [{ start: 3, end: 5 }];
  assert.equal(inRanges(3, r), true);
  assert.equal(inRanges(5, r), true);
  assert.equal(inRanges(2, r), false);
  assert.equal(inRanges(6, r), false);
  assert.equal(inRanges(3, []), false);
  assert.equal(inRanges(3, null), false);
});

test('splitFindings: 按行范围拆成新增与遗留', () => {
  const fs = [
    { rule: 'r', severity: 'info', line: 3 },
    { rule: 'r', severity: 'info', line: 40 },
    { rule: 'r', severity: 'info', line: 61 }
  ];
  const s = splitFindings(fs, [{ start: 1, end: 5 }, { start: 61, end: 61 }], false);
  assert.deepEqual(s.added.map(function (f) { return f.line; }), [3, 61]);
  assert.deepEqual(s.existing.map(function (f) { return f.line; }), [40]);
});

test('splitFindings: allNew 为真时全部算新增', () => {
  const s = splitFindings([{ rule: 'r', line: 1 }, { rule: 'r', line: 99 }], [], true);
  assert.equal(s.added.length, 2);
  assert.equal(s.existing.length, 0);
});

test('splitFindings: 空范围时全部算遗留', () => {
  const s = splitFindings([{ rule: 'r', line: 1 }], [], false);
  assert.equal(s.added.length, 0);
  assert.equal(s.existing.length, 1);
});

test('untrackedFiles: 忽略 .gitignore 命中的文件', (t) => {
  const d = join(tmpdir(), 'llmlint-ut-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
  mkdirSync(d, { recursive: true });
  t.after(function () { rmSync(d, { recursive: true, force: true }); });
  const g = function (args) { execFileSync('git', args, { cwd: d, encoding: 'utf8' }); };
  g(['init', '-q']);
  g(['config', 'user.email', 't@example.com']);
  g(['config', 'user.name', 't']);
  g(['config', 'core.autocrlf', 'false']);
  writeFileSync(join(d, '.gitignore'), 'ignored.md' + NL, 'utf8');
  writeFileSync(join(d, 'seed.md'), 'x' + NL, 'utf8');
  g(['add', '-A']);
  g(['commit', '-q', '-m', 'base']);
  writeFileSync(join(d, 'new.md'), 'x' + NL, 'utf8');
  writeFileSync(join(d, 'ignored.md'), 'x' + NL, 'utf8');
  const f = untrackedFiles(d);
  assert.ok(f.indexOf('new.md') !== -1, '应包含新文件');
  assert.equal(f.indexOf('ignored.md'), -1, '应忽略 .gitignore 命中的文件');
  assert.equal(f.indexOf('seed.md'), -1, '已跟踪的文件不应算未跟踪');
});

// ---------- git 仓库端到端 ----------

function gitdir(t) {
  const d = join(tmpdir(), 'llmlint-diff-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
  mkdirSync(d, { recursive: true });
  t.after(function () { rmSync(d, { recursive: true, force: true }); });
  const g = function (args) {
    return execFileSync('git', args, { cwd: d, encoding: 'utf8' });
  };
  g(['init', '-q']);
  g(['config', 'user.email', 'test@example.com']);
  g(['config', 'user.name', 'test']);
  g(['config', 'commit.gpgsign', 'false']);
  g(['config', 'core.autocrlf', 'false']);
  return {
    dir: d,
    write: function (rel, content) {
      const p = join(d, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content, 'utf8');
    },
    commit: function (msg) { g(['add', '-A']); g(['commit', '-q', '-m', msg]); },
    g: g
  };
}

function runCli(dir, args) {
  return spawnSync(process.execPath, [CLI].concat(args), { encoding: 'utf8', cwd: dir });
}

const BASE_DOC = '# 标题' + NL + NL + '中文AI' + NL + NL + '这是正文说明。' + NL;

test('diff: 新增文件整份都算新增', (t) => {
  const r = gitdir(t);
  r.write('docs/seed.md', '干净的文档。' + NL);
  r.commit('seed');
  r.write('docs/new.md', '中文AI' + NL);
  const res = runCli(r.dir, ['diff', '--enable', 'cjk-spacing', '--format', 'json', 'docs/new.md']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const j = JSON.parse(res.stdout);
  assert.equal(j.newFile, true);
  assert.equal(j.added.length, 1);
  assert.equal(j.existing.length, 0);
  assert.equal(j.added[0].line, 1);
  assert.equal(j.score.score, 98);
});

test('diff: 只把改动行上的问题算新增，其余算遗留', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  r.write('docs/a.md', '# 标题' + NL + NL + '中文AI' + NL + NL + '这是正文说明。  ' + NL);
  const res = runCli(r.dir, ['diff', '--enable', 'cjk-spacing,trailing-space', '--format', 'json', 'docs/a.md']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const j = JSON.parse(res.stdout);
  assert.equal(j.newFile, false);
  assert.deepEqual(j.added.map(function (f) { return [f.rule, f.line]; }), [['trailing-space', 5]]);
  assert.deepEqual(j.existing.map(function (f) { return [f.rule, f.line]; }), [['cjk-spacing', 3]]);
  assert.equal(j.score.score, 98);
  assert.equal(j.score.penalty, 2);
});

test('diff: 未改动的文件全部算遗留，评分 100', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  const res = runCli(r.dir, ['diff', '--format', 'json', 'docs/a.md']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const j = JSON.parse(res.stdout);
  assert.equal(j.added.length, 0);
  assert.equal(j.existing.length, 1);
  assert.equal(j.score.score, 100);
});

test('diff: 不给文件时只检查变更过的文件', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  r.write('docs/b.md', '中文AI' + NL);
  const res = runCli(r.dir, ['diff', '--enable', 'cjk-spacing', '--format', 'json']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.ok(res.stdout.indexOf('docs/b.md') !== -1, '应包含新文件');
  assert.ok(res.stdout.indexOf('docs/a.md') === -1, '不应包含未改动的文件');
});

test('diff: 删除的文件被跳过', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.write('docs/b.md', '中文AI' + NL);
  r.commit('base');
  rmSync(join(r.dir, 'docs/b.md'));
  const res = runCli(r.dir, ['diff', '--format', 'json']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.ok(res.stdout.indexOf('docs/b.md') === -1);
});

test('diff: --base 指定更早的提交做基准', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', '干净的文档。' + NL);
  r.commit('v1');
  r.write('docs/a.md', '中文AI' + NL);
  r.commit('v2');
  const res = runCli(r.dir, ['diff', '--base', 'HEAD~1', '--enable', 'cjk-spacing', '--format', 'json', 'docs/a.md']);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const j = JSON.parse(res.stdout);
  assert.equal(j.base, 'HEAD~1');
  assert.equal(j.added.length, 1);
  const bad = runCli(r.dir, ['diff', '--base', 'v1', '--format', 'json']);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /找不到对比基准/);
});

test('diff: 新增 error 级发现时退出码为 2', (t) => {
  const r = gitdir(t);
  r.write('docs/seed.md', '干净的文档。' + NL);
  r.commit('seed');
  r.write('docs/todo.md', 'TODO: 补上这段内容。' + NL);
  const res = runCli(r.dir, ['diff', '--enable', 'placeholder-text', '--format', 'json', 'docs/todo.md']);
  assert.equal(res.status, 2, res.stdout);
  assert.equal(JSON.parse(res.stdout).added.length, 1);
});

test('diff: 遗留 error 不触发非零退出码', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', 'TODO: 补上这段内容。' + NL);
  r.commit('base');
  const res = runCli(r.dir, ['diff', '--enable', 'placeholder-text', '--format', 'json', 'docs/a.md']);
  assert.equal(res.status, 0, res.stdout);
  assert.equal(JSON.parse(res.stdout).existing.length, 1);
});

test('diff: 配置里的 severity 覆盖让新增 warning 触发 --fail-on', (t) => {
  const r = gitdir(t);
  r.write('llmlint.json', JSON.stringify({ severity: { 'trailing-space': 'warning' } }));
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  r.write('docs/a.md', '# 标题' + NL + NL + '中文AI' + NL + NL + '这是正文说明。  ' + NL);
  const ok = runCli(r.dir, ['diff', '--enable', 'trailing-space', 'docs/a.md']);
  assert.equal(ok.status, 0, ok.stdout);
  const bad = runCli(r.dir, ['diff', '--enable', 'trailing-space', '--fail-on', 'warning', 'docs/a.md']);
  assert.equal(bad.status, 1, bad.stdout);
});

test('diff: 文本报告区分新增与遗留', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  r.write('docs/a.md', '# 标题' + NL + NL + '中文AI' + NL + NL + '这是正文说明。  ' + NL);
  const res = runCli(r.dir, ['diff', '--enable', 'cjk-spacing,trailing-space', 'docs/a.md']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /本次新增 ---/);
  assert.match(res.stdout, /新增\s+1 条\s+遗留 1 条（不扣分）/);
});

test('diff: 无新增时给出明确结论', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  const res = runCli(r.dir, ['diff', 'docs/a.md']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /本次变更未引入新问题。/);
});

test('diff: Markdown 报告包含遗留数量', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  r.write('docs/a.md', '# 标题' + NL + NL + '中文AI' + NL + NL + '这是正文说明。  ' + NL);
  const res = runCli(r.dir, ['diff', '--format', 'md', '--enable', 'cjk-spacing,trailing-space', 'docs/a.md']);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /历史遗留（不扣分）/);
  assert.match(res.stdout, /## 本次新增/);
});

test('diff: 没有变更文件时给出提示并以 0 退出', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  const res = runCli(r.dir, ['diff']);
  assert.equal(res.status, 0, res.stdout);
  assert.match(res.stdout, /没有变更文件/);
});

test('diff: 不支持 --fix', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  const res = runCli(r.dir, ['diff', '--fix', 'docs/a.md']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /不支持 --fix/);
});

test('diff: 不支持标准输入', (t) => {
  const r = gitdir(t);
  r.write('docs/a.md', BASE_DOC);
  r.commit('base');
  const res = runCli(r.dir, ['diff', '-']);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /标准输入/);
});

test('prepareDiff: 非 git 工作树给出可操作提示', (t) => {
  const d = join(tmpdir(), 'llmlint-no-git-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
  mkdirSync(d, { recursive: true });
  t.after(function () { rmSync(d, { recursive: true, force: true }); });
  if (inGitWorkTree(d)) return; // 外层存在 git 仓库时无法构造反例
  assert.equal(inGitWorkTree(d), false);
  assert.throws(function () { prepareDiff('HEAD', d); }, function (e) {
    return e instanceof DiffError && /不是 git 工作树/.test(e.message);
  });
});
