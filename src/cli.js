#!/usr/bin/env node
'use strict';

// =====================================================================
// llmlint 命令行 — 检查 AI 生成文本的质量
// =====================================================================

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { checkDocument, RULES, fixDocument } from './index.js';
import { loadConfig, ConfigError, effectiveOptions, resolveOptions, normalizePath } from './config.js';

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
  o.push('  llmlint config [path]          显示解析出的配置与生效选项');
  o.push(NL);
  o.push('选项:');
  o.push('  --format text|md|json           输出格式（默认 text）');
  o.push('  --min-severity info|warning|error  最低报告级别');
  o.push('  --enable a,b,c                  只运行指定规则');
  o.push('  --disable a,b,c                 跳过指定规则');
  o.push('  --max N                         最多返回 N 条发现');
  o.push('  --fail-on error|warning         CI 达到该级别即返回非零（默认 error）');
  o.push('  --fix                           自动修复可机械处理的规则并原地保存');
  o.push('  --dry-run                       配合 --fix：只报告将改什么，不写磁盘');
  o.push('  --config file                   指定配置文件（默认从当前目录向上查找）');
  o.push('  --no-config                     不使用配置文件');
  o.push('  --output file                   写入文件而非标准输出');
  o.push('  --help                          显示本帮助');
  o.push(NL);
  o.push('配置文件：从当前目录向上逐级查找 llmlint.json 或 .llmlintrc.json，');
  o.push('优先级为命令行参数 > 配置文件 > 默认值。配置项见 llmlint config。');
  o.push(NL);
  o.push('输入支持文件路径或 -（标准输入）。零依赖、纯本地、不上传任何内容。');
  return o.join(NL);
}

const COMMANDS = ['check', 'score', 'rules', 'version', 'config'];

function parseArgs(argv) {
  const args = {
    command: 'check', files: [], format: 'text', minSeverity: undefined,
    enable: undefined, disable: undefined, max: undefined, output: null,
    failOn: undefined, help: false, fix: false, dryRun: false, config: null, noConfig: false
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
    else if (a === '--fix') args.fix = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--config') args.config = argv[++i];
    else if (a === '--no-config') args.noConfig = true;
    else if (a.length > 1 && a.charAt(0) === '-') throw new Error('未知选项: ' + a);
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

// 文件相对配置根的路径；标准输入返回空串，不参与路径匹配。
function relPathOf(config, file) {
  if (!file || file === '-') return '';
  const root = config ? config.root : process.cwd();
  return normalizePath(relative(root, resolve(file)));
}

// config 命令：打印找到的配置文件、命中的 rules 块、以及合并后的生效选项。
function formatConfig(config, args) {
  const rel = relPathOf(config, args.files[0]);
  const matched = resolveOptions(config, rel).matched;
  const eff = effectiveOptions(args, config, rel);
  return JSON.stringify({
    source: config ? config.source : null,
    root: config ? config.root : null,
    path: rel ? rel : null,
    matched: matched,
    effective: {
      enable: eff.enable,
      disable: eff.disable,
      'min-severity': eff.minSeverity,
      'max-findings': eff.maxFindings,
      'fail-on': eff.failOn,
      severity: eff.severity
    }
  }, null, 2);
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

  let config = null;
  if (!args.noConfig) {
    try { config = loadConfig(process.cwd(), args.config); }
    catch (e) {
      if (e instanceof ConfigError) { console.error(e.message); process.exit(1); }
      throw e;
    }
  }
  if (args.command === 'config') { emit(formatConfig(config, args), args.output); return; }
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

    const eff = effectiveOptions(args, config, relPathOf(config, file));

    let fixNote = '';
    let fixInfo = null;
    if (args.fix) {
      const fx = fixDocument(text, { enable: eff.enable, disable: eff.disable });
      if (fx.fixes.length > 0) {
        if (file === '-' && !args.dryRun) { process.stdout.write(fx.text); continue; }
        if (!args.dryRun) writeFileSync(resolve(file), fx.text, 'utf8');
        text = fx.text;
        fixInfo = fx.fixes;
        fixNote = (args.dryRun ? '将修复（未写入）  ' : '已修复  ') + fx.fixes.map(function (f) { return f.rule + ' x' + f.count; }).join(', ');
      }
    }

    const result = checkDocument(text, {
      enable: eff.enable, disable: eff.disable,
      minSeverity: eff.minSeverity, maxFindings: eff.maxFindings,
      severity: eff.severity
    });

    let body;
    if (args.command === 'score') {
      body = file + '  ' + result.score.score + '/100  ' + result.score.grade +
        '  ' + result.findings.length + ' findings' + (fixNote ? '  ' + fixNote : '');
    } else if (args.format === 'json') {
      body = JSON.stringify({ file: file, score: result.score, findings: result.findings, summary: result.summary, fixes: fixInfo }, null, 2);
    } else if (args.format === 'md') {
      body = formatMd(result, file);
    } else {
      body = formatText(result, file);
    }
    if (fixNote && args.command !== 'score' && args.format !== 'json') body = body + NL + fixNote;
    if (config && args.command !== 'score' && args.format !== 'json') body = body + NL + '配置    ' + config.source;
    parts.push(body);

    if (result.score.counts.error > 0) exitCode = Math.max(exitCode, 2);
    else if (result.score.counts.warning > 0 && eff.failOn === 'warning') exitCode = Math.max(exitCode, 1);
  }

  emit(parts.join(NL + NL), args.output);
  if (exitCode > 0) process.exitCode = exitCode;
}

main();
