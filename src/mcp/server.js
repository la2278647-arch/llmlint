#!/usr/bin/env node
'use strict';

// =====================================================================
// llmlint MCP server — 零依赖，手写 stdio JSON-RPC 2.0
// 用法: node src/mcp/server.js
// 无需 @modelcontextprotocol/sdk，仅使用 Node 内置模块。
// =====================================================================

import { readFileSync } from 'node:fs';
import { checkDocument, RULES, fixDocument, FIXABLE } from '../index.js';

const NL = String.fromCharCode(10);
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const SEVERITY = {
  type: 'string',
  enum: ['info', 'warning', 'error'],
  description: '最低报告级别，默认 info'
};

const RULE_IDS = {
  type: 'array',
  items: { type: 'string' },
  description: '规则 id 列表，取自 list_rules'
};

const MAX_FINDINGS = {
  type: 'integer',
  minimum: 0,
  description: '最多返回多少条问题；只影响返回数量，不影响评分'
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
        enable: RULE_IDS,
        disable: RULE_IDS,
        maxFindings: MAX_FINDINGS
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
        minSeverity: SEVERITY,
        enable: RULE_IDS,
        disable: RULE_IDS,
        maxFindings: MAX_FINDINGS
      },
      required: ['path']
    }
  },
  {
    name: 'fix_document',
    description: '自动修复一段 Markdown 文本并返回修复后的文本。只修可机械修复的规则，剩下的问题列在 remaining 里',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '待修复的文本内容' },
        minSeverity: SEVERITY,
        enable: RULE_IDS,
        disable: RULE_IDS,
        maxFindings: MAX_FINDINGS
      },
      required: ['text']
    }
  },
  {
    name: 'fix_file',
    description: '自动修复一个本地 Markdown 文件并返回修复后的文本，不会写回文件',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        minSeverity: SEVERITY,
        enable: RULE_IDS,
        disable: RULE_IDS,
        maxFindings: MAX_FINDINGS
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

// lint_document 与 lint_file 共用同一个选项映射，
// 避免一个工具接住某个参数、另一个偷偷忽略。
function lintText(text, args) {
  const result = checkDocument(text, {
    minSeverity: args.minSeverity,
    enable: args.enable,
    disable: args.disable,
    maxFindings: args.maxFindings
  });
  return { score: result.score, findings: result.findings, summary: result.summary };
}

// 跑一遍修复，再跑一遍检查，把「修了什么」和「还剩什么」都还给调用方。
function fixText(text, args) {
  const opts = { minSeverity: args.minSeverity, enable: args.enable, disable: args.disable };
  const before = checkDocument(text, opts);
  const fixed = fixDocument(text, opts);
  const after = checkDocument(fixed.text, Object.assign({}, opts, { maxFindings: args.maxFindings }));
  return {
    changed: fixed.text !== text,
    text: fixed.text,
    changes: fixed.fixes,
    scoreBefore: before.score,
    scoreAfter: after.score,
    remaining: after.findings,
    fixable: FIXABLE.slice()
  };
}

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
    return Object.assign({ file: args.path }, lintText(text, args));
  }
  if (name === 'fix_document') {
    if (typeof args.text !== 'string') return { error: 'text 必须是字符串' };
    return fixText(args.text, args);
  }
  if (name === 'fix_file') {
    if (typeof args.path !== 'string') return { error: 'path 必须是字符串' };
    let text;
    try { text = readFileSync(args.path, 'utf8'); }
    catch (e) { return { error: '读取文件失败: ' + e.message }; }
    return Object.assign({ file: args.path }, fixText(text, args));
  }
  if (name === 'lint_document') {
    if (typeof args.text !== 'string') return { error: 'text 必须是字符串' };
    return lintText(args.text, args);
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
        instructions: 'llmlint 检查 Markdown 文本质量：' + RULES.length + ' 条规则、0-100 评分。fix_document 与 fix_file 可自动修复行尾空格、中英文空格与末尾换行。'
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
