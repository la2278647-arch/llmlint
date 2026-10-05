'use strict';

// =====================================================================
// llmlint 项目级配置 — llmlint.json / .llmlintrc.json
// 零依赖 glob、向上逐级查找、JSON 语法错误带行号列号
// =====================================================================

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { RULES } from './rules.js';

const BS = String.fromCharCode(92);
const NL = String.fromCharCode(10);
const DQ = String.fromCharCode(34);

const FILENAMES = ['llmlint.json', '.llmlintrc.json'];
const SEVERITIES = ['info', 'warning', 'error'];
const TOP_KEYS = ['min-severity', 'max-findings', 'fail-on', 'enable', 'disable', 'severity', 'rules'];
const BLOCK_KEYS = ['path', 'min-severity', 'max-findings', 'enable', 'disable', 'severity'];
const META = ['^', '$', '.', '|', '+', '(', ')', '[', ']', '{', '}'];
const RULE_IDS = RULES.map(function (r) { return r.id; });

export class ConfigError extends Error {
  constructor(path, message) {
    super((path ? path + ': ' : '') + message);
    this.name = 'ConfigError';
    this.path = path;
  }
}

// ---------- glob ----------

// '**' 匹配零个或多个路径段；'*' 与 '?' 不跨 '/'。
function globToRegExp(pattern) {
  let out = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern.charAt(i);
    if (c === '*') {
      if (pattern.charAt(i + 1) === '*') {
        if (pattern.charAt(i + 2) === '/') { out += '(?:[^/]+/)*'; i += 3; }
        else { out += '.*'; i += 2; }
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (c === '?') {
      out += '[^/]';
      i += 1;
    } else if (META.indexOf(c) !== -1) {
      out += BS + c;
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return new RegExp(out + '$');
}

// 统一分隔符、去掉 './' 前缀。不做大小写折叠，与 .gitignore 一致。
export function normalizePath(p) {
  let s = String(p).split(BS).join('/');
  while (s.indexOf('./') === 0) s = s.slice(2);
  return s;
}

export function globMatch(pattern, relPath) {
  return globToRegExp(normalizePath(pattern)).test(normalizePath(relPath));
}

// ---------- 定位 ----------

// 从 JSON.parse 的错误信息取行号列号；取不到就用 position 自己算。
function jsonLoc(text, message) {
  const m = String(message).match(/line (\d+) column (\d+)/);
  if (m) return '第 ' + m[1] + ' 行 ' + m[2] + ' 列';
  const p = String(message).match(/position (\d+)/);
  if (p) {
    const parts = text.slice(0, Number(p[1])).split(NL);
    return '第 ' + parts.length + ' 行 ' + (parts[parts.length - 1].length + 1) + ' 列';
  }
  return '';
}

// 找到某个 key 首次出现的行号，用于未知配置项的报错。
function lineOfKey(text, key) {
  const idx = text.indexOf(DQ + key + DQ);
  if (idx < 0) return '';
  return '第 ' + text.slice(0, idx).split(NL).length + ' 行';
}

// ---------- 校验 ----------

function badValue(path, key, expected, got) {
  throw new ConfigError(path, '配置项 ' + DQ + key + DQ + ' 应为 ' + expected + '，实际是 ' + JSON.stringify(got));
}

function asStringList(path, key, value) {
  if (!Array.isArray(value)) badValue(path, key, '字符串数组', value);
  for (const v of value) {
    if (typeof v !== 'string' || v.length === 0) badValue(path, key, '非空字符串', v);
  }
  return value.slice();
}

function asRuleList(path, key, value) {
  const out = asStringList(path, key, value);
  for (const v of out) {
    if (RULE_IDS.indexOf(v) === -1) {
      throw new ConfigError(path, '配置项 ' + DQ + key + DQ + ' 包含未知规则 ' + DQ + v + DQ + '，运行 llmlint rules 查看全部 ' + RULE_IDS.length + ' 条');
    }
  }
  return out;
}

function asSeverity(path, key, value) {
  if (typeof value !== 'string' || SEVERITIES.indexOf(value) === -1) {
    badValue(path, key, 'info / warning / error', value);
  }
  return value;
}

function asMaxFindings(path, key, value) {
  if (typeof value !== 'number' || !isFinite(value) || value < 0 || Math.floor(value) !== value) {
    badValue(path, key, '非负整数', value);
  }
  return value;
}

function asSeverityMap(path, key, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) badValue(path, key, '对象（规则 id 映射到严重度）', value);
  const out = {};
  for (const id of Object.keys(value)) {
    if (RULE_IDS.indexOf(id) === -1) throw new ConfigError(path, '配置项 ' + DQ + key + DQ + ' 包含未知规则 ' + DQ + id + DQ);
    out[id] = asSeverity(path, key + '.' + id, value[id]);
  }
  return out;
}

function readBlock(path, data, text, label, allowKeys) {
  const keys = allowKeys || BLOCK_KEYS;
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError(path, label + ' 必须是 JSON 对象');
  }
  for (const key of Object.keys(data)) {
    if (keys.indexOf(key) === -1) {
      throw new ConfigError(path, '未知配置项 ' + DQ + key + DQ + (lineOfKey(text, key) ? '（' + lineOfKey(text, key) + '）' : '') + '，可用：' + keys.join(', '));
    }
  }
  const out = { enable: [], disable: [], minSeverity: null, maxFindings: null, failOn: null, severity: {} };
  if ('min-severity' in data) out.minSeverity = asSeverity(path, 'min-severity', data['min-severity']);
  if ('max-findings' in data) out.maxFindings = asMaxFindings(path, 'max-findings', data['max-findings']);
  if ('fail-on' in data) out.failOn = asSeverity(path, 'fail-on', data['fail-on']);
  if ('enable' in data) out.enable = asRuleList(path, 'enable', data.enable);
  if ('disable' in data) out.disable = asRuleList(path, 'disable', data.disable);
  if ('severity' in data) out.severity = asSeverityMap(path, 'severity', data.severity);
  return out;
}

export function parseConfig(text, path) {
  path = path || '<string>';
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const loc = jsonLoc(text, e.message);
    throw new ConfigError(path, '不是合法 JSON' + (loc ? '（' + loc + '）' : '') + '：' + String(e.message).split(NL)[0]);
  }
  const top = readBlock(path, data, text, '顶层', TOP_KEYS);
  const rules = [];
  if ('rules' in data) {
    if (!Array.isArray(data.rules)) badValue(path, 'rules', '对象数组', data.rules);
    for (let i = 0; i < data.rules.length; i++) {
      const item = data.rules[i];
      const where = 'rules[' + i + ']';
      if (item === null || typeof item !== 'object' || Array.isArray(item)) throw new ConfigError(path, where + ' 必须是 JSON 对象');
      const paths = 'path' in item ? asStringList(path, where + '.path', item.path) : [];
      rules.push({ paths: paths, opts: readBlock(path, item, text, where) });
    }
  }
  return { top: top, rules: rules };
}

// ---------- 查找 ----------

// 从 startDir 向上逐级查找，找到第一个即停；都找不到返回 null。
export function loadConfig(startDir, explicitPath) {
  if (explicitPath) {
    const p = resolve(explicitPath);
    if (!existsSync(p)) throw new ConfigError(explicitPath, '配置文件不存在');
    return readConfigFile(p);
  }
  let dir = resolve(startDir);
  for (;;) {
    for (const name of FILENAMES) {
      const p = join(dir, name);
      if (existsSync(p)) return readConfigFile(p);
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readConfigFile(p) {
  let text;
  try {
    text = readFileSync(p, 'utf8');
  } catch (e) {
    throw new ConfigError(p, '无法读取：' + String(e.message).split(NL)[0]);
  }
  const cfg = parseConfig(text, p);
  cfg.source = p;
  cfg.root = dirname(p);
  return cfg;
}

// ---------- 合并 ----------

function applyBlock(out, opts) {
  if (!opts) return;
  if (opts.minSeverity !== null) out.minSeverity = opts.minSeverity;
  if (opts.maxFindings !== null) out.maxFindings = opts.maxFindings;
  if (opts.failOn !== null) out.failOn = opts.failOn;
  for (const id of opts.enable) out.enable.push(id);
  for (const id of opts.disable) out.disable.push(id);
  for (const id of Object.keys(opts.severity)) out.severity[id] = opts.severity[id];
}

function dedupe(list) {
  const out = [];
  for (const v of list) if (out.indexOf(v) === -1) out.push(v);
  return out;
}

// 顶层设置先应用，路径命中的 rules 块按顺序叠加。
// path 数组是「或」关系；没写 path 的块对任何文件生效。
export function resolveOptions(config, relPath) {
  const matched = [];
  const empty = { enable: [], disable: [], minSeverity: null, maxFindings: null, failOn: null, severity: {} };
  if (!config) return { opts: empty, matched: matched };
  const out = { enable: [], disable: [], minSeverity: null, maxFindings: null, failOn: null, severity: {} };
  applyBlock(out, config.top);
  for (const block of config.rules) {
    const hit = block.paths.length === 0 || block.paths.some(function (p) { return globMatch(p, relPath); });
    if (!hit) continue;
    matched.push(block.paths.length === 0 ? '<all>' : block.paths.join(', '));
    applyBlock(out, block.opts);
  }
  return {
    opts: {
      enable: dedupe(out.enable),
      disable: dedupe(out.disable),
      minSeverity: out.minSeverity,
      maxFindings: out.maxFindings,
      failOn: out.failOn,
      severity: out.severity
    },
    matched: matched
  };
}

// 命令行参数 > 配置文件 > 默认值。命令行参数未传时保持 undefined。
// --enable 是白名单，优先级高于配置的 --disable：命令行声明「只跑这些」时，
// 配置里的黑名单若继续生效，会和白名单互相抵消，规则一条都跑不起来。
export function effectiveOptions(args, config, relPath) {
  const o = resolveOptions(config, relPath).opts;
  const cliEnable = Array.isArray(args.enable) && args.enable.length > 0;
  const disable = Array.isArray(args.disable) ? args.disable : (cliEnable ? [] : o.disable);
  return {
    enable: cliEnable ? args.enable : o.enable,
    disable: disable,
    minSeverity: args.minSeverity ? args.minSeverity : (o.minSeverity || 'info'),
    maxFindings: args.max !== undefined ? args.max : (o.maxFindings || 0),
    failOn: args.failOn ? args.failOn : (o.failOn || 'error'),
    severity: o.severity
  };
}
