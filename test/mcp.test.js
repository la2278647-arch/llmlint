'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const NL = String.fromCharCode(10);
const serverPath = fileURLToPath(new URL('../src/mcp/server.js', import.meta.url));

/** 一次性发送若干 JSON-RPC 消息并收集全部响应 */
function rpc(messages) {
  return new Promise(function (resolve, reject) {
    const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', function (d) { out += d; });
    child.stderr.on('data', function (d) { err += d; });
    child.on('error', reject);
    child.on('close', function () {
      const lines = out.split(NL).filter(function (l) { return l.trim() !== ''; })
        .map(function (l) { return JSON.parse(l); });
      resolve({ lines: lines, err: err });
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + NL);
    child.stdin.end();
  });
}

test('initialize 返回服务信息与工具能力', async () => {
  const r = await rpc([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }]);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].result.serverInfo.name, 'llmlint');
  assert.equal(r.lines[0].result.protocolVersion, '2024-11-05');
  assert.ok(r.lines[0].result.capabilities.tools);
});

test('未知协议版本回落到默认版本', async () => {
  const r = await rpc([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }]);
  assert.equal(r.lines[0].result.protocolVersion, '2024-11-05');
});

test('tools/list 返回五个工具且 schema 完整', async () => {
  const r = await rpc([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
  const names = r.lines[0].result.tools.map(function (t) { return t.name; });
  assert.deepEqual(names.sort(), ['fix_document', 'fix_file', 'lint_document', 'lint_file', 'list_rules']);
  for (const t of r.lines[0].result.tools) {
    assert.ok(t.inputSchema.properties || t.inputSchema.type);
    assert.ok(t.description.length > 0);
  }
});

test('lint_document 返回评分与问题', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lint_document', arguments: { text: '这是一个革命性的工具，上周提升了 45%。' + NL } } }
  ]);
  const body = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(typeof body.score.score, 'number');
  assert.ok(body.score.score <= 100);
  assert.ok(Array.isArray(body.findings));
  assert.ok(body.findings.length > 0);
  assert.equal(r.lines[0].result.isError, false);
});

test('lint_document 缺少 text 参数时标记错误', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lint_document', arguments: {} } }
  ]);
  assert.equal(r.lines[0].result.isError, true);
  assert.ok(/text/.test(JSON.parse(r.lines[0].result.content[0].text).error));
});

test('lint_file 检查本地示例文件', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lint_file', arguments: { path: 'examples/demo-good.md' } } }
  ]);
  const body = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(body.findings.length, 0);
  assert.equal(body.score.score, 100);
});

test('list_rules 返回全部 26 条规则', async () => {
  const r = await rpc([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_rules', arguments: {} } }]);
  const body = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(body.length, 26);
  assert.ok(/placeholder-text/.test(body[0]));
});

test('fix_document 修复行尾空格、中英文空格与末尾换行', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fix_document', arguments: { text: '中文English混排没有空格。 ' } } }
  ]);
  assert.equal(r.lines[0].result.isError, false);
  const body = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(body.changed, true);
  assert.equal(body.text, '中文 English 混排没有空格。' + NL);
  assert.equal(body.scoreBefore.score, 92);
  assert.equal(body.scoreAfter.score, 100);
  assert.equal(body.scoreAfter.grade, 'A');
  assert.equal(body.remaining.length, 0);
  assert.deepEqual(body.changes.map(function (c) { return c.rule; }), ['trailing-space', 'cjk-spacing', 'no-final-newline']);
  assert.deepEqual(body.fixable, ['trailing-space', 'cjk-spacing', 'no-final-newline']);
});

test('fix_document 无可修复内容时 changed 为 false', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fix_document', arguments: { text: '干净的一段文字。' + NL } } }
  ]);
  const body = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(body.changed, false);
  assert.equal(body.changes.length, 0);
  assert.equal(body.scoreAfter.score, 100);
});

test('fix_document 修不了的规则留在 remaining 里', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fix_document', arguments: { text: '这是一个 TODO 占位符。 ' } } }
  ]);
  const body = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(body.changed, true);
  assert.equal(body.remaining.length, 1);
  assert.equal(body.remaining[0].rule, 'placeholder-text');
  assert.equal(body.scoreAfter.score, 90);
});

test('fix_document 缺少 text 参数时标记错误', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fix_document', arguments: {} } }
  ]);
  assert.equal(r.lines[0].result.isError, true);
  assert.ok(/text/.test(JSON.parse(r.lines[0].result.content[0].text).error));
});

test('fix_file 返回修复后的文本且不写回文件', async () => {
  const before = readFileSync('examples/demo-bad.md', 'utf8');
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fix_file', arguments: { path: 'examples/demo-bad.md' } } }
  ]);
  assert.equal(r.lines[0].result.isError, false);
  const body = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(body.file, 'examples/demo-bad.md');
  assert.equal(body.changed, true);
  assert.ok(body.text.length > 0);
  assert.equal(readFileSync('examples/demo-bad.md', 'utf8'), before, '原文件必须保持不变');
});

test('fix_file 缺少 path 或路径不存在时标记错误', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'fix_file', arguments: {} } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'fix_file', arguments: { path: 'no/such/file.md' } } }
  ]);
  for (const line of r.lines) assert.equal(line.result.isError, true);
  assert.ok(/path/.test(JSON.parse(r.lines[0].result.content[0].text).error));
  assert.ok(/读取文件失败/.test(JSON.parse(r.lines[1].result.content[0].text).error));
});

test('lint_file 与 lint_document 支持 disable 与 maxFindings', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lint_file', arguments: { path: 'examples/demo-bad.md', disable: ['trailing-space', 'cjk-spacing', 'no-final-newline'] } } },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'lint_file', arguments: { path: 'examples/demo-bad.md', maxFindings: 2 } } }
  ]);
  const a = JSON.parse(r.lines[0].result.content[0].text);
  assert.equal(a.findings.every(function (f) { return f.rule !== 'trailing-space'; }), true);
  const b = JSON.parse(r.lines[1].result.content[0].text);
  assert.equal(b.findings.length, 2);
  assert.equal(b.score.score, 0, '评分不受 maxFindings 影响');
});

test('未知工具返回 isError 并说明工具名', async () => {
  const r = await rpc([{ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'frobnicate', arguments: {} } }]);
  assert.equal(r.lines[0].result.isError, true);
  assert.match(JSON.parse(r.lines[0].result.content[0].text).error, /未知工具: frobnicate/);
});

test('未知方法返回 -32601', async () => {
  const r = await rpc([{ jsonrpc: '2.0', id: 1, method: 'no/such' }]);
  assert.equal(r.lines[0].error.code, -32601);
});

test('同一连接上多条消息按序响应', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' }
  ]);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.lines.map(function (l) { return l.id; }), [1, 2]);
});
