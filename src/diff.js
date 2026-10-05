'use strict';

// =====================================================================
// 增量检查 — 只把变更行引入的问题算作新增
// 遗留问题照常可见，但不扣分，避免历史包袱卡住第一次接 CI 的项目
// =====================================================================

import { execFileSync } from 'node:child_process';

const NL = String.fromCharCode(10);
// unified diff 的分段头：@@ -old[,count] +new[,count] @@
const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

export class DiffError extends Error {
  constructor(message, hint) {
    super(hint ? message + NL + hint : message);
    this.name = 'DiffError';
  }
}

function git(cwd, argv, allowEmpty) {
  try {
    return execFileSync('git', argv, {
      cwd: cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (e) {
    if (allowEmpty) return '';
    throw e;
  }
}

export function inGitWorkTree(cwd) {
  try {
    return git(cwd, ['rev-parse', '--is-inside-work-tree']).trim() === 'true';
  } catch (e) {
    return false;
  }
}

// 校验基准引用存在，报不出具体原因时给出可操作的提示。
export function prepareDiff(base, cwd) {
  if (!inGitWorkTree(cwd)) {
    throw new DiffError('当前目录不是 git 工作树', '在仓库里运行，或改用 llmlint check 做完整检查。');
  }
  try {
    git(cwd, ['rev-parse', '--verify', '--quiet', base]);
  } catch (e) {
    throw new DiffError('找不到对比基准: ' + base, '可以用 HEAD、origin/main 或一个 commit 编号，用 --base 指定。');
  }
}

// 取新文件侧的改动行范围，并把相邻或重叠的区间合并。
export function changedRanges(diffText) {
  const raw = [];
  const lines = String(diffText).split(/\r?\n/);
  for (const line of lines) {
    const m = HUNK_RE.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) raw.push({ start: start, end: start + count - 1 });
  }
  raw.sort(function (a, b) { return a.start - b.start; });
  const out = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 1) {
      if (r.end > last.end) last.end = r.end;
    } else {
      out.push({ start: r.start, end: r.end });
    }
  }
  return out;
}

export function inRanges(line, ranges) {
  if (!ranges || ranges.length === 0) return false;
  for (const r of ranges) {
    if (line >= r.start && line <= r.end) return true;
  }
  return false;
}

// 把发现拆成「本次新增」和「历史遗留」。allNew 为真时整份都算新增。
export function splitFindings(findings, ranges, allNew) {
  const added = [];
  const existing = [];
  for (const f of findings) {
    if (allNew || inRanges(f.line, ranges)) added.push(f);
    else existing.push(f);
  }
  return { added: added, existing: existing };
}

// 相对 base 的变更文件与状态。A 新增、D 删除、M 修改。
export function changedFiles(base, cwd) {
  const files = [];
  const lines = git(cwd, ['diff', '--name-status', '--no-renames', base]).split(/\r?\n/);
  for (const line of lines) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const file = line.slice(tab + 1).trim();
    if (!file) continue;
    files.push({ file: file, status: line.slice(0, tab).charAt(0) });
  }
  return files;
}

// 未跟踪的新文件：git diff 看不到它们，但用户显然想检查。
export function untrackedFiles(cwd) {
  return git(cwd, ['ls-files', '--others', '--exclude-standard'])
    .split(/\r?\n/)
    .map(function (s) { return s.trim(); })
    .filter(Boolean);
}

// base 里读不到该文件即视为新增文件，整份内容都算新增。
export function isNewFile(base, file, cwd) {
  try {
    git(cwd, ['cat-file', '-e', base + ':' + file]);
    return false;
  } catch (e) {
    return true;
  }
}

export function diffText(base, file, cwd) {
  return git(cwd, ['diff', '--unified=0', base, '--', file], true);
}
