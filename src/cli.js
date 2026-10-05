#!/usr/bin/env node
'use strict';

// =====================================================================
// llmlint 命令行 — 检查 AI 生成文本的质量
// =====================================================================

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkDocument, RULES } from './index.js';

const NL = String.fromCharCode(10);
const BT = String.fromCharCode(96);
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

function pad(s, n) {
  s = String(s);
  while (s.length < n) s += ' ';
  return s;
}

function esc(s) { return String(s).replace(/[|]/g, '\|'); }
function tick(s) { return BT + s + BT; }

function usage() {
  const o = [];
  o.push('llmlint ' + pkg.version + ' — LLM 输出质量检查器');
  o.push(NL);
  o.push('用法:');
  o.push('  llmlint check <file> [...]     完整检查报告');
  o.push('  llmlint score <file> [...]     只看评分');
  o.push('  llmlint rules                  列出全部规则');
  o.push('  llmlint version                显示版本号');
  o.push(NL);
  o.push('选项:');
  o.push('  --format text|md|json           输出格式（默认 text）');
  o.push('  --min-severity info|warning|error  最低报告级别');
  o.push('  --enable a,b,c                  只运行指定规则');
  o.push('  --disable a,b,c                 跳过指定规则');
  o.push('  --max N                         最多返回 N 条发现');
  o.push('  --fail-on error|warning         CI 达到该级别即返回非零（默认 error）');
  o.push('  --output file                   写入文件而非标准输出');
  o.push('  --help                          显示本帮助');
  o.push(NL);
  o.push('输入支持文件路径或 -（标准输入）。零依赖、纯本地、不上传任何内容。');
  return o.join(NL);
}

const COMMANDS = ['check', 'score', 'rules', 'version'];

function parseArgs(argv) {
  const args = {
    command: 'check', files: [], format: 'text', minSeverity: 'info',
    enable: [], disable: [], max: 0, output: null, failOn: 'error', help: false
  };
  let commandResolved = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--format' || a === '-f') args.format = argv[++i];
    else if (a === '--min-severity') args.minSeverity = argv[++i];
    else if (a === '--enable') args.enable = argv[++i].split(',');
    else if (a === '--disable') args.disable = argv[++i].split(',');
    else if (a === '--max') args.max = parseInt(argv[++i], 10) || 0;
    else if (a === '--output' || a === '-o') args.output = argv[++i];
    else if (a === '--fail-on') args.failOn = argv[++i];
    else if (a.charAt(0) === '-') throw new Error('未知选项: ' + a);
    else if (!commandResolved) {
      commandResolved = true;
      if (COMMANDS.indexOf(a) !== -1) args.command = a;
      else args.files.push(a);
    } else {
      args.files.push(a);
    }
  }
  return args;
}

function readInput(file) {
  if (file === '-') return readFileSync(0, 'utf8');
  if (!existsSync(file)) throw new Error('文件不存在: ' + file);
  return readFileSync(file, 'utf8');
}

function formatText(result, file) {
  const o = [];
  const icon = { error: 'x', warning: '!', info: 'i' };
  o.push('llmlint — ' + file);
  o.push(NL);
  o.push('评分    ' + pad(result.score.score + '/100', 7) + '等级 ' + result.score.grade);
  o.push('问题    ' + result.findings.length + ' 条（error ' + result.score.counts.error + ' / warning ' + result.score.counts.warning + ' / info ' + result.score.counts.info + '）');
  o.push('规则    ' + result.summary.checked + '/' + result.summary.rules);
  o.push(NL);
  if (result.findings.length === 0) {
    o.push('未发现问题。');
    return o.join(NL);
  }
  o.push('--- 问题明细 ---');
  o.push(NL);
  for (const f of result.findings) {
    o.push(icon[f.severity] + '  ' + pad(f.line + ':' + f.column, 8) + f.rule + '  [' + f.severity + ']');
    o.push('      ' + f.message);
    if (f.snippet) o.push('      ' + f.snippet);
    o.push(NL);
  }
  return o.join(NL);
}

function formatMd(result, file) {
  const o = [];
  o.push('# llmlint 报告');
  o.push(NL);
  o.push('**文件** ' + tick(file));
  o.push(NL);
  o.push('**评分** ' + tick(result.score.score + '/100') + '（等级 ' + tick(result.score.grade) + '）');
  o.push(NL);
  o.push('| 严重度 | 数量 |');
  o.push('| --- | --- |');
  o.push('| error | ' + result.score.counts.error + ' |');
  o.push('| warning | ' + result.score.counts.warning + ' |');
  o.push('| info | ' + result.score.counts.info + ' |');
  o.push(NL);
  if (result.findings.length === 0) {
    o.push('未发现问题。');
    return o.join(NL);
  }
  o.push('## 问题明细');
  o.push(NL);
  o.push('| 行:列 | 规则 | 严重度 | 说明 |');
  o.push('| --- | --- | --- | --- |');
  for (const f of result.findings) {
    o.push('| ' + f.line + ':' + f.column + ' | ' + tick(f.rule) + ' | ' + f.severity + ' | ' + esc(f.message) + ' |');
  }
  return o.join(NL);
}

function formatRules() {
  const o = [];
  o.push('# llmlint 规则列表（' + RULES.length + ' 条）');
  o.push(NL);
  o.push('| 规则 | 严重度 | 说明 |');
  o.push('| --- | --- | --- |');
  for (const r of RULES) {
    o.push('| ' + tick(r.id) + ' | ' + r.severity + ' | ' + r.description + ' |');
  }
  return o.join(NL);
}

function emit(body, output) {
  if (output) {
    writeFileSync(resolve(output), body + NL, 'utf8');
    console.log('报告已写入 ' + output);
  } else {
    console.log(body);
  }
}

function main() {
  const argv = process.argv.slice(2);
  let args;
  try { args = parseArgs(argv); }
  catch (e) { console.error('参数错误: ' + e.message + NL + NL + usage()); process.exit(1); }

  if (args.help) { console.log(usage()); return; }
  if (args.command === 'version') { console.log(pkg.version); return; }
  if (args.command === 'rules') { emit(formatRules(), args.output); return; }
  if (args.command !== 'check' && args.command !== 'score') {
    console.error('未知命令: ' + args.command + NL + NL + usage());
    process.exit(1);
  }
  if (args.files.length === 0) {
    console.error('未指定文件。用法: llmlint check <file> [--format json]');
    process.exit(1);
  }

  let exitCode = 0;
  const parts = [];
  for (const file of args.files) {
    let text;
    try { text = readInput(file); }
    catch (e) { console.error(e.message); exitCode = Math.max(exitCode, 1); continue; }

    const result = checkDocument(text, {
      enable: args.enable, disable: args.disable,
      minSeverity: args.minSeverity, maxFindings: args.max
    });

    let body;
    if (args.command === 'score') {
      body = file + '  ' + result.score.score + '/100  ' + result.score.grade +
        '  ' + result.findings.length + ' findings';
    } else if (args.format === 'json') {
      body = JSON.stringify({ file: file, score: result.score, findings: result.findings, summary: result.summary }, null, 2);
    } else if (args.format === 'md') {
      body = formatMd(result, file);
    } else {
      body = formatText(result, file);
    }
    parts.push(body);

    if (result.score.counts.error > 0) exitCode = Math.max(exitCode, 2);
    else if (result.score.counts.warning > 0 && args.failOn === 'warning') exitCode = Math.max(exitCode, 1);
  }

  emit(parts.join(NL + NL), args.output);
  if (exitCode > 0) process.exitCode = exitCode;
}

main();
