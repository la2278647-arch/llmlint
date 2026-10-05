'use strict';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkDocument, RULES } from '../src/index.js';
import {
  ConfigError, effectiveOptions, globMatch, loadConfig, normalizePath,
  parseConfig, resolveOptions
} from '../src/config.js';

const NL = String.fromCharCode(10);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(ROOT, 'src', 'cli.js');
const TR = 'trailing-space';
const CJ = 'cjk-spacing';
const FN = 'no-final-newline';
const SC = 'sentence-too-long';

function mkd() {
  const d = join(tmpdir(), 'llmlint-cfg-' + Date.now() + '-' + Math.floor(Math.random() * 1e6));
  mkdirSync(d, { recursive: true });
  return d;
}

function put(d, rel, content) {
  const p = join(d, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, 'utf8');
  return p;
}

function cli(args, opts) {
  return spawnSync(process.execPath, [CLI].concat(args), Object.assign({ encoding: 'utf8', cwd: process.cwd() }, opts || {}));
}

function cleanup(d) { rmSync(d, { recursive: true, force: true }); }

// ---------- glob ----------

test('glob：** 匹配零个或多个路径段', () => {
  assert.ok(globMatch('**/*.md', 'a.md'));
  assert.ok(globMatch('**/*.md', 'docs/a.md'));
  assert.ok(globMatch('**/*.md', 'src/deep/b.md'));
  assert.ok(!globMatch('**/*.md', 'docs/a.txt'));
  assert.ok(!globMatch('**/*.md', 'docs'));
});

test('glob：* 不跨 /，? 只匹配单个字符', () => {
  assert.ok(globMatch('*.md', 'a.md'));
  assert.ok(!globMatch('*.md', 'docs/a.md'));
  assert.ok(globMatch('docs/*.md', 'docs/a.md'));
  assert.ok(!globMatch('docs/*.md', 'docs/sub/a.md'));
  assert.ok(globMatch('a?c', 'abc'));
  assert.ok(!globMatch('a?c', 'aXbc'));
});

test('glob：正则元字符按字面量处理', () => {
  assert.ok(globMatch('v1.0.md', 'v1.0.md'));
  assert.ok(!globMatch('v1.0.md', 'v1X0.md'));
  assert.ok(!globMatch('v1.0.md', 'v1100.md'));
});

test('normalizePath：反斜杠与 ./ 前缀统一', () => {
  assert.equal(normalizePath('docs' + String.fromCharCode(92) + 'a.md'), 'docs/a.md');
  assert.equal(normalizePath('./docs/a.md'), 'docs/a.md');
  assert.equal(normalizePath('.//./a.md'), '/./a.md');
});

// ---------- 解析与校验 ----------

test('parseConfig：语法错误报行号列号与原因', () => {
  const bad = '{' + NL + '  "disable": ["cjk-spacing"],' + NL + '}';
  assert.throws(() => parseConfig(bad), (e) => {
    assert.equal(e.name, 'ConfigError');
    assert.match(e.message, /不是合法 JSON/);
    assert.match(e.message, /第 3 行/);
    return true;
  });
});

test('parseConfig：未知配置项指出行号且带文件路径', () => {
  const bad = '{' + NL + '  "min-severity": "info",' + NL + '  "wrong-key": true' + NL + '}';
  assert.throws(() => parseConfig(bad, 'x.json'), (e) => {
    assert.equal(e.message.indexOf('x.json'), 0, e.message);
    assert.match(e.message, /未知配置项/);
    assert.match(e.message, /wrong-key/);
    assert.match(e.message, /第 3 行/);
    return true;
  });
});

test('parseConfig：未知规则 id 提示查看 rules 命令', () => {
  const bad = '{ "disable": ["not-a-rule"] }';
  assert.throws(() => parseConfig(bad), (e) => {
    assert.match(e.message, /not-a-rule/);
    assert.match(e.message, /llmlint rules/);
    assert.match(e.message, new RegExp(String(RULES.length) + ' 条'));
    return true;
  });
});

test('parseConfig：min-severity 只接受 info warning error', () => {
  assert.throws(() => parseConfig('{ "min-severity": "loud" }'), /应为 info/);
  assert.throws(() => parseConfig('{ "min-severity": 3 }'), /应为 info/);
});

test('parseConfig：max-findings 必须是非负整数', () => {
  assert.throws(() => parseConfig('{ "max-findings": -1 }'), /非负整数/);
  assert.throws(() => parseConfig('{ "max-findings": 1.5 }'), /非负整数/);
  assert.throws(() => parseConfig('{ "max-findings": "10" }'), /非负整数/);
});

test('parseConfig：enable 必须是非空字符串数组', () => {
  assert.throws(() => parseConfig('{ "enable": "cjk-spacing" }'), /字符串数组/);
  assert.throws(() => parseConfig('{ "enable": ["", "cjk-spacing"] }'), /非空字符串/);
});

test('parseConfig：severity 映射到未知规则报错', () => {
  assert.throws(() => parseConfig('{ "severity": { "nope": "error" } }'), /nope/);
  assert.throws(() => parseConfig('{ "severity": { "sentence-too-long": "loud" } }'), /应为 info/);
});

test('parseConfig：顶层必须是 JSON 对象', () => {
  assert.throws(() => parseConfig('[]'), /必须是 JSON 对象/);
  assert.throws(() => parseConfig('"x"'), /必须是 JSON 对象/);
});

test('parseConfig：rules 块省略 path 时 paths 为空数组', () => {
  const cfg = parseConfig('{ "rules": [ { "disable": ["cjk-spacing"] } ] }');
  assert.equal(cfg.rules.length, 1);
  assert.deepEqual(cfg.rules[0].paths, []);
  assert.deepEqual(cfg.rules[0].opts.disable, [CJ]);
});

// ---------- 查找 ----------

test('loadConfig：从子目录向上逐级找到第一个配置', () => {
  const d = mkd();
  const cfg = put(d, 'llmlint.json', '{ "min-severity": "warning" }');
  const sub = join(d, 'a', 'b');
  mkdirSync(sub, { recursive: true });
  const got = loadConfig(sub);
  assert.equal(got.source, cfg);
  assert.equal(got.top.minSeverity, 'warning');
  assert.equal(got.root, dirname(got.source));
  cleanup(d);
});

test('loadConfig：同目录 llmlint.json 优先于 .llmlintrc.json', () => {
  const d = mkd();
  put(d, '.llmlintrc.json', '{ "min-severity": "error" }');
  const cfg = put(d, 'llmlint.json', '{ "min-severity": "warning" }');
  const got = loadConfig(d);
  assert.equal(got.source, cfg);
  assert.equal(got.top.minSeverity, 'warning');
  cleanup(d);
});

test('loadConfig：找不到返回 null', () => {
  const d = mkd();
  assert.equal(loadConfig(join(d, 'x')), null);
  cleanup(d);
});

test('loadConfig：显式路径不存在时抛 ConfigError', () => {
  const d = mkd();
  const missing = join(d, 'nope.json');
  assert.throws(() => loadConfig(d, missing), (e) => {
    assert.equal(e.name, 'ConfigError');
    assert.match(e.message, /配置文件不存在/);
    return true;
  });
  cleanup(d);
});

// ---------- 合并 ----------

test('resolveOptions：无配置时返回全空', () => {
  const r = resolveOptions(null, 'a.md');
  assert.deepEqual(r.opts.enable, []);
  assert.deepEqual(r.opts.disable, []);
  assert.equal(r.opts.minSeverity, null);
  assert.equal(r.opts.maxFindings, null);
  assert.equal(r.opts.failOn, null);
  assert.deepEqual(r.matched, []);
});

test('resolveOptions：顶层设置直接生效', () => {
  const cfg = parseConfig('{ "min-severity": "warning", "max-findings": 5, "fail-on": "warning" }');
  const o = resolveOptions(cfg, 'a.md').opts;
  assert.equal(o.minSeverity, 'warning');
  assert.equal(o.maxFindings, 5);
  assert.equal(o.failOn, 'warning');
});

test('resolveOptions：后续命中的块覆盖前面的标量', () => {
  const cfg = parseConfig(JSON.stringify({
    'min-severity': 'info',
    rules: [
      { path: ['**'], 'min-severity': 'warning' },
      { path: ['docs/**'], 'min-severity': 'error' }
    ]
  }));
  assert.equal(resolveOptions(cfg, 'docs/x.md').opts.minSeverity, 'error');
  assert.equal(resolveOptions(cfg, 'src/x.md').opts.minSeverity, 'warning');
});

test('resolveOptions：matched 记录命中的块顺序', () => {
  const cfg = parseConfig(JSON.stringify({
    rules: [
      { path: ['**'], disable: [TR] },
      { path: ['docs/**'], disable: [CJ] }
    ]
  }));
  assert.deepEqual(resolveOptions(cfg, 'docs/x.md').matched, ['**', 'docs/**']);
  assert.deepEqual(resolveOptions(cfg, 'src/x.md').matched, ['**']);
});

test('resolveOptions：disable 累积并去重', () => {
  const cfg = parseConfig(JSON.stringify({
    disable: [CJ],
    rules: [{ path: ['**'], disable: [CJ, TR] }]
  }));
  assert.deepEqual(resolveOptions(cfg, 'a.md').opts.disable, [CJ, TR]);
});

test('resolveOptions：path 数组是或关系', () => {
  const cfg = parseConfig(JSON.stringify({
    rules: [{ path: ['docs/**', 'readme.md'], disable: [CJ] }]
  }));
  assert.equal(resolveOptions(cfg, 'docs/x.md').opts.disable.length, 1);
  assert.equal(resolveOptions(cfg, 'readme.md').opts.disable.length, 1);
  assert.equal(resolveOptions(cfg, 'other/x.md').opts.disable.length, 0);
});

test('resolveOptions：未写 path 的块对任何文件生效', () => {
  const cfg = parseConfig(JSON.stringify({ rules: [{ disable: [CJ] }] }));
  const r = resolveOptions(cfg, '');
  assert.deepEqual(r.opts.disable, [CJ]);
  assert.deepEqual(r.matched, ['<all>']);
});

test('resolveOptions：severity 覆盖映射透传', () => {
  const cfg = parseConfig('{ "severity": { "sentence-too-long": "error" } }');
  assert.equal(resolveOptions(cfg, 'a.md').opts.severity[SC], 'error');
});

// ---------- 优先级 ----------

test('effectiveOptions：命令行参数优先于配置文件', () => {
  const cfg = parseConfig('{ "min-severity": "error", "disable": ["cjk-spacing"], "max-findings": 9 }');
  const o = effectiveOptions({ minSeverity: 'info', enable: [TR], disable: [], max: 0 }, cfg, 'a.md');
  assert.equal(o.minSeverity, 'info');
  assert.deepEqual(o.disable, []);
  assert.deepEqual(o.enable, [TR]);
  assert.equal(o.maxFindings, 0);
});

test('effectiveOptions：命令行未传时取配置值', () => {
  const cfg = parseConfig('{ "min-severity": "error", "disable": ["cjk-spacing"], "fail-on": "warning" }');
  const o = effectiveOptions({}, cfg, 'a.md');
  assert.equal(o.minSeverity, 'error');
  assert.deepEqual(o.disable, [CJ]);
  assert.equal(o.failOn, 'warning');
});

test('effectiveOptions：两者都无时取默认值', () => {
  const o = effectiveOptions({}, null, 'a.md');
  assert.equal(o.minSeverity, 'info');
  assert.equal(o.maxFindings, 0);
  assert.equal(o.failOn, 'error');
  assert.deepEqual(o.enable, []);
  assert.deepEqual(o.disable, []);
});

// ---------- severity 覆盖 ----------

test('checkDocument：severity 覆盖改变扣分', () => {
  const src = '中文AI写作' + NL;
  const base = checkDocument(src);
  const cjk = base.findings.filter((f) => f.rule === CJ);
  assert.ok(cjk.length > 0, '应至少命中一次');
  assert.equal(cjk[0].severity, 'info');
  const up = checkDocument(src, { severity: { 'cjk-spacing': 'error' } });
  const cjk2 = up.findings.filter((f) => f.rule === CJ);
  assert.equal(cjk2[0].severity, 'error');
  assert.ok(up.score.penalty > base.score.penalty, '提升严重度后扣分应增加');
});

test('checkDocument：severity 覆盖与 min-severity 阈值联动', () => {
  const src = '中文AI写作' + NL;
  const hidden = checkDocument(src, { minSeverity: 'warning' });
  assert.equal(hidden.findings.some((f) => f.rule === CJ), false);
  const shown = checkDocument(src, { minSeverity: 'warning', severity: { 'cjk-spacing': 'error' } });
  assert.ok(shown.findings.some((f) => f.rule === CJ));
});

// ---------- CLI ----------

test('CLI --config：disable 生效并减少发现数', () => {
  const d = mkd();
  const cfg = put(d, 'cfg.json', '{ "disable": ["trailing-space", "cjk-spacing", "no-final-newline"] }');
  const f = put(d, 'a.md', '中文AI写作   ' + NL);
  const r = cli(['check', '--format', 'json', '--config', cfg, f], { cwd: d });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).findings.length, 0);
  cleanup(d);
});

test('CLI：命令行 --enable 覆盖配置里的 disable', () => {
  const d = mkd();
  const cfg = put(d, 'cfg.json', '{ "disable": ["trailing-space"] }');
  const f = put(d, 'a.md', '中文AI写作   ' + NL);
  const r = cli(['check', '--format', 'json', '--config', cfg, '--enable', TR, f], { cwd: d });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).findings.some((x) => x.rule === TR));
  cleanup(d);
});

test('CLI --no-config：完全忽略配置文件', () => {
  const d = mkd();
  const cfg = put(d, 'cfg.json', '{ "disable": ["trailing-space"] }');
  const f = put(d, 'a.md', '中文AI写作   ' + NL);
  const a = cli(['check', '--format', 'json', '--no-config', f], { cwd: d });
  const b = cli(['check', '--format', 'json', '--config', cfg, f], { cwd: d });
  assert.equal(a.status, 0, a.stderr);
  assert.ok(JSON.parse(b.stdout).findings.length < JSON.parse(a.stdout).findings.length);
  cleanup(d);
});

test('CLI：配置文件语法错误报行号并以非零退出', () => {
  const d = mkd();
  const cfg = put(d, 'bad.json', '{' + NL + '  "disable": ["trailing-space"],' + NL + '}');
  const f = put(d, 'a.md', '正文' + NL);
  const r = cli(['check', '--config', cfg, f], { cwd: d });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /第 3 行/);
  assert.match(r.stderr, /不是合法 JSON/);
  cleanup(d);
});

test('CLI：未知配置项以非零退出', () => {
  const d = mkd();
  const cfg = put(d, 'bad.json', '{ "typo-key": true }');
  const f = put(d, 'a.md', '正文' + NL);
  const r = cli(['check', '--config', cfg, f], { cwd: d });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /未知配置项/);
  cleanup(d);
});

test('CLI：配置里的 fail-on 生效，命令行可覆盖', () => {
  const d = mkd();
  const cfg = put(d, 'cfg.json', '{ "fail-on": "warning" }');
  const f = put(d, 'a.md', '# 标题' + NL + NL + '### 小标题' + NL);
  const a = cli(['check', '--format', 'json', '--config', cfg, '--enable', 'heading-jump', f], { cwd: d });
  assert.equal(a.status, 1, 'fail-on warning 应返回 1');
  const b = cli(['check', '--format', 'json', '--config', cfg, '--fail-on', 'error', '--enable', 'heading-jump', f], { cwd: d });
  assert.equal(b.status, 0, '命令行 --fail-on error 应覆盖配置');
  cleanup(d);
});

test('CLI：配置里的 max-findings 生效', () => {
  const d = mkd();
  const cfg = put(d, 'cfg.json', '{ "max-findings": 2 }');
  const f = put(d, 'a.md', readFileSync(join(ROOT, 'examples', 'demo-bad.md'), 'utf8'));
  const r = cli(['check', '--format', 'json', '--config', cfg, f], { cwd: d });
  assert.equal(r.status, 2);
  assert.ok(JSON.parse(r.stdout).findings.length <= 2);
  cleanup(d);
});

test('CLI config 命令：输出配置文件、命中块与生效选项', () => {
  const d = mkd();
  const cfg = put(d, 'cfg.json', JSON.stringify({
    'min-severity': 'warning',
    rules: [{ path: ['docs/**'], disable: ['cjk-spacing'] }]
  }));
  const f = put(d, 'docs/x.md', '正文' + NL);
  const r = cli(['config', '--config', cfg, f], { cwd: d });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.source, cfg);
  assert.equal(rep.path, 'docs/x.md');
  assert.deepEqual(rep.matched, ['docs/**']);
  assert.equal(rep.effective['min-severity'], 'warning');
  assert.deepEqual(rep.effective.disable, [CJ]);
  cleanup(d);
});

test('CLI config 命令：无配置时 source 为 null', () => {
  const d = mkd();
  const f = put(d, 'a.md', '正文' + NL);
  const r = cli(['config', '--no-config', f], { cwd: d });
  assert.equal(r.status, 0, r.stderr);
  const rep = JSON.parse(r.stdout);
  assert.equal(rep.source, null);
  assert.equal(rep.path, 'a.md');
  cleanup(d);
});

test('CLI：从当前目录向上逐级自动发现配置', () => {
  const d = mkd();
  const cfg = put(d, 'llmlint.json', '{ "disable": ["trailing-space", "cjk-spacing", "no-final-newline"] }');
  const sub = join(d, 'deep', 'er');
  mkdirSync(sub, { recursive: true });
  const f = join(sub, 'a.md');
  writeFileSync(f, '中文AI写作   ', 'utf8');
  const r = cli(['check', '--format', 'json', f], { cwd: sub });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).findings.length, 0);
  const c = cli(['config', f], { cwd: sub });
  assert.equal(JSON.parse(c.stdout).source, cfg);
  cleanup(d);
});

test('CLI：--config 指向不存在的文件时报错退出', () => {
  const d = mkd();
  const f = put(d, 'a.md', '正文' + NL);
  const r = cli(['check', '--config', join(d, 'missing.json'), f], { cwd: d });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /配置文件不存在/);
  cleanup(d);
});
