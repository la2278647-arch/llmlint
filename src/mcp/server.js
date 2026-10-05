#!/usr/bin/env node
'use strict';

// =====================================================================
// llmlint MCP server — 零依赖，手写 stdio JSON-RPC 2.0
// 用法: node src/mcp/server.js
// 无需 @modelcontextprotocol/sdk，仅使用 Node 内置模块。
// =====================================================================

import { readFileSync } from 'node:fs';
import { checkDocument, RULES } from '../index.js';

const NL = String.fromCharCode(10);
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const SEVERITY = {
  type: 'string',
  enum: ['info', 'warning', 'error'],
  description: '最低报告级别，默认 info'
};

const TOOLS = [
  {
    name: 'lint_document',
    description: '检查一段 Markdown 文本的质量，返回 0-100 评分、等级与问题清单',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待检查的文本内容' },
        minSeverity: SEVERITY,
        disable: { type: 'array', items: { type: 'string' }, description: '要跳过的规则 id' },
        maxFindings: { type: 'integer', minimum: 0, description: '最多返回多少条问题' }
      },
      required: ['text']
    }
  },
  {
    name: 'lint_file',
    description: '检查一个本地 Markdown 文件的质量',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        minSeverity: SEVERITY
      },
      required: ['path']
    }
  },
  {
    name: 'list_rules',
    description: '列出全部检查规则、严重度与说明',
    inputSchema: { type: 'object', properties: {} }
  }
];

function runTool(name, args) {
  args = args || {};
  if (name === 'list_rules') {
    return RULES.map(function (r) {
      return r.id + ' [' + r.severity + '] ' + r.description;
    });
  }
  if (name === 'lint_file') {
    if (typeof args.path !== 'string') return { error: 'path 必须是字符串' };
    let text;
    try { text = readFileSync(args.path, 'utf8'); }
    catch (e) { return { error: '读取文件失败: ' + e.message }; }
    const result = checkDocument(text, { minSeverity: args.minSeverity, disable: args.disable });
    return { file: args.path, score: result.score, findings: result.findings };
  }
  if (name === 'lint_document') {
    if (typeof args.text !== 'string') return { error: 'text 必须是字符串' };
    const result = checkDocument(args.text, {
      minSeverity: args.minSeverity,
      disable: args.disable,
      maxFindings: args.maxFindings
    });
    return { score: result.score, findings: result.findings, summary: result.summary };
  }
  return { error: '未知工具: ' + name };
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + NL);
}

function handleMessage(msg) {
  const id = msg.id;
  const method = msg.method;

  if (method === 'initialize') {
    const params = msg.params || {};
    send({
      jsonrpc: '2.0',
      id: id,
      result: {
        protocolVersion: params.protocolVersion || '2024-11-05',
        serverInfo: { name: 'llmlint', version: pkg.version },
        capabilities: { tools: {} },
        instructions: 'llmlint 检查 Markdown 文本质量：' + RULES.length + ' 条规则、0-100 评分。'
      }
    });
    return;
  }
  if (method === 'initialized') return;
  if (method === 'ping') { send({ jsonrpc: '2.0', id: id, result: {} }); return; }
  if (method === 'tools/list') { send({ jsonrpc: '2.0', id: id, result: { tools: TOOLS } }); return; }
  if (method === 'tools/call') {
    const params = msg.params || {};
    const result = runTool(params.name, params.arguments);
    send({
      jsonrpc: '2.0',
      id: id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: Object.prototype.hasOwnProperty.call(result, 'error')
      }
    });
    return;
  }
  if (method === 'shutdown') { send({ jsonrpc: '2.0', id: id, result: {} }); return; }

  if (id !== undefined) {
    send({ jsonrpc: '2.0', id: id, error: { code: -32601, message: 'Method not found: ' + method } });
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function (chunk) {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf(NL)) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (line.trim() === '') continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { continue; }
    if (msg && typeof msg === 'object') handleMessage(msg);
  }
});
process.stdin.on('end', function () { process.exit(0); });
