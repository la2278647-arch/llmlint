'use strict';

// 覆盖 CLI 的输出格式分支：markdown 报告、rules 列表、score 单行、错误路径

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const CLI = fileURLToPath(new URL('../src/cli.js', import.meta.url));

const run = function (args) {
  return spawnSync(process.execPath, [CLI].concat(args), { encoding: 'utf8' });
};

const withFile = function (content, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'llmlint-md-'));
  const f = join(dir, 'x.md');
  writeFileSync(f, content, 'utf8');
  try { return fn(f); } finally { rmSync(dir, { recursive: true, force: true }); }
};

test('CLI --format md 输出 markdown 报告', () => {
  withFile('这里有 TODO 待办。' + NL, function (f) {
    const r = run(['check', '--format', 'md', f]);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.ok(r.stdout.charAt(0) === '#', 'markdown 报告以 # 开头');
    assert.match(r.stdout, /# llmlint 报告/);
    assert.match(r.stdout, /\*\*文件\*\*/);
    assert.match(r.stdout, /\*\*评分\*\*/);
    assert.match(r.stdout, /0\/100/);
    assert.match(r.stdout, /\| error \| 1 \|/);
    assert.match(r.stdout, /\| warning \| 0 \|/);
    assert.match(r.stdout, /\| info \| 0 \|/);
    assert.match(r.stdout, /placeholder-text/);
    assert.match(r.stdout, /## 问题明细/);
    assert.match(r.stdout, /\| 1:\d+ \|/);
  });
});

test('CLI --format md 无问题时给出干净结论', () => {
  withFile('# 标题' + NL + NL + '这是正文说明。' + NL, function (f) {
    const r = run(['check', '--format', 'md', f]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /未发现问题。/);
    assert.ok(r.stdout.indexOf('问题明细') === -1, '干净文档不应有明细表');
  });
});

test('CLI --format md 配合 --fix 追加修复说明', () => {
  withFile('中文AI   ' + NL, function (f) {
    const r = run(['check', '--format', 'md', '--fix', '--dry-run', f]);
    assert.match(r.stdout, /将修复/);
    assert.match(r.stdout, /cjk-spacing/);
    assert.match(r.stdout, /trailing-space/);
  });
});

test('CLI rules 命令列出全部规则与严重度', () => {
  const r = run(['rules']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /24 条/);
  assert.match(r.stdout, /\| `placeholder-text` \| error \|/);
  assert.match(r.stdout, /\| `no-final-newline` \| info \|/);
  assert.match(r.stdout, /\| `unbalanced-markdown` \| error \|/);
});

test('CLI score 命令每个文件只输出一行', () => {
  withFile('这里有 TODO 待办。' + NL, function (f) {
    const r = run(['score', f]);
    assert.equal(r.status, 2, r.stderr);
    const lines = r.stdout.trim().split(NL);
    assert.equal(lines.length, 1, 'score 命令应为单行输出：' + r.stdout);
    assert.match(lines[0], /\d+\/100  [A-F]  1 findings$/);
  });
});

test('CLI score 命令对多文件逐行输出', () => {
  withFile('干净正文。' + NL, function (a) {
    const dir = mkdtempSync(join(tmpdir(), 'llmlint-md-'));
    const b = join(dir, 'y.md');
    writeFileSync(b, 'TODO' + NL, 'utf8');
    try {
      const r = run(['score', a, b]);
      assert.equal(r.status, 2, r.stderr);
      const rows = r.stdout.split(NL).filter(function (l) { return l.trim() !== ''; });
      assert.equal(rows.length, 2, '两个文件应有两行输出：' + r.stdout);
      rows.forEach(function (l) { assert.match(l, /\d+\/100  [A-F]  \d+ findings$/); });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

test('CLI 首个参数不是命令时按文件检查', () => {
  const r = run(['frobnicate.md']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /文件不存在: frobnicate\.md/);
});

test('CLI check 不带文件报错并退出 1', () => {
  const r = run(['check']);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /未指定文件/);
});

test('CLI --format md 写入 -o 文件', () => {
  withFile('TODO' + NL, function (f) {
    const dir = mkdtempSync(join(tmpdir(), 'llmlint-md-'));
    const o = join(dir, 'report.md');
    try {
      const r = run(['check', '--format', 'md', '-o', o, f]);
      assert.equal(r.status, 2, r.stderr);
      assert.match(r.stdout, /报告已写入/);
      const body = readFileSync(o, 'utf8');
      assert.match(body, /# llmlint 报告/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});