'use strict';

// =====================================================================
// llmlint 规则定义 — 26 条针对 LLM 生成文本的静态检查规则
// =====================================================================

import {
  NL, lineCol, snippet, scan, maskCode, maskUrls, rule, RULES,
  PLACEHOLDER_RE, FILLER_RE, HEDGE_RE, OVERCLAIM_RE, SUPERLATIVE_RE,
  VAGUE_TIME_RE, EMOJI_RE, CJK_LATIN_RE, CN_PUNCT_RE, KANA_RE,
  JA_HALF_PUNCT_RE, HANKAKU_KANA_RE, ZENKAKU_KANA_RE,
  HEADING_RE,
  BARE_URL_RE, LIST_RE, EMPTY_LIST_RE, TABLE_RE, SENTENCE_RE,
  SHOUT_RE, PCT_RE, SHOUT_OK, FENCE_LINE_RE
} from './engine.js';

const hit = function (text, m, message) {
  const p = lineCol(text, m.index);
  return { message: message, line: p.line, column: p.column, snippet: snippet(text, m.index) };
};

const short = function (s, n) { return s.length > n ? s.slice(0, n) + '...' : s; };

// 1 — 占位符残留
rule({
  id: 'placeholder-text', severity: 'error', description: '残留占位符或未填写内容',
  check: function (text) {
    const out = [];
    for (const m of scan(maskCode(text), PLACEHOLDER_RE)) {
      out.push(hit(text, m, '存在未填写的占位符 "' + m[0] + '"'));
    }
    return out;
  }
});

// 2 — 空洞词过多
rule({
  id: 'filler-words', severity: 'warning', description: '空洞词过多，稀释信息密度',
  check: function (text) {
    const all = scan(maskCode(text), FILLER_RE);
    if (all.length > 5) {
      return [hit(text, all[0], '空洞词过多（' + all.length + ' 处，如 "' + all[0][0] + '"），建议精简')];
    }
    return [];
  }
});

// 3 — 过度限定
rule({
  id: 'hedge-words', severity: 'info', description: '限定词过多，语气不够确定',
  check: function (text) {
    const all = scan(maskCode(text), HEDGE_RE);
    if (all.length > 8) {
      return [hit(text, all[0], '限定词过多（' + all.length + ' 处），建议明确表述')];
    }
    return [];
  }
});

// 4 — 绝对化断言
rule({
  id: 'overclaim', severity: 'warning', description: '绝对化、不可证伪的断言',
  check: function (text) {
    const out = [];
    for (const m of scan(maskCode(text), OVERCLAIM_RE)) {
      out.push(hit(text, m, '绝对化断言 "' + m[0] + '"，建议给出依据或限定范围'));
    }
    return out;
  }
});

// 5 — 营销夸张词
rule({
  id: 'marketing-superlative', severity: 'warning', description: '营销级夸张词，削弱可信度',
  check: function (text) {
    const out = [];
    for (const m of scan(maskCode(text), SUPERLATIVE_RE)) {
      out.push(hit(text, m, '营销夸张词 "' + m[0] + '"，建议用具体事实替代'));
    }
    return out;
  }
});

// 6 — 模糊时间
rule({
  id: 'vague-time', severity: 'warning', description: '模糊时间表述（AI 幻觉高发点）',
  check: function (text) {
    const out = [];
    for (const m of scan(maskCode(text), VAGUE_TIME_RE)) {
      out.push(hit(text, m, '模糊时间表述 "' + m[0] + '"，建议改为具体日期'));
    }
    return out;
  }
});

// 7 — 重复句子
rule({
  id: 'repetition', severity: 'warning', description: '重复的句子',
  check: function (text) {
    const out = [];
    const masked = maskCode(text);
    const norm = function (s) { return s.replace(/\s+/g, ' ').trim(); };
    const seen = new Set();
    for (const m of scan(masked, SENTENCE_RE)) {
      const key = norm(m[0]);
      if (key.length < 18) continue;
      if (seen.has(key)) {
        out.push(hit(text, m, '重复的句子: "' + short(key, 42) + '"'));
      } else {
        seen.add(key);
      }
    }
    return out;
  }
});

// 8 — emoji 过多
rule({
  id: 'emoji-sprawl', severity: 'info', description: 'emoji 使用过量',
  check: function (text) {
    const all = scan(maskCode(text), EMOJI_RE);
    if (all.length > 8) {
      return [hit(text, all[0], 'emoji 过多（共 ' + all.length + ' 个），建议节制使用')];
    }
    return [];
  }
});

// 9 — 标题跳级
rule({
  id: 'heading-jump', severity: 'warning', description: '标题层级跳级',
  check: function (text) {
    // 屏蔽代码块：bash 注释里的 # 文本不是标题。
    const out = [];
    let prev = 0;
    for (const m of scan(maskCode(text), HEADING_RE)) {
      const level = m[0].match(/^#+/)[0].length;
      if (prev > 0 && level > prev + 1) {
        out.push(hit(text, m, '标题层级跳级（H' + prev + ' -> H' + level + '），应逐级递进'));
      }
      prev = level;
    }
    return out;
  }
});

// 10 — 重复标题
rule({
  id: 'repeated-heading', severity: 'warning', description: '重复的标题',
  check: function (text) {
    // 屏蔽代码块：示例里反复出现的 # 注释不是重复标题。
    const out = [];
    const seen = new Set();
    for (const m of scan(maskCode(text), HEADING_RE)) {
      const title = m[1].trim();
      if (seen.has(title)) {
        out.push(hit(text, m, '重复的标题: "' + short(title, 40) + '"'));
      } else {
        seen.add(title);
      }
    }
    return out;
  }
});

// 11 — 裸 URL
rule({
  id: 'bare-url', severity: 'info', description: '裸 URL 未包装为链接文本',
  check: function (text) {
    const out = [];
    const masked = maskCode(text);
    for (const m of scan(masked, BARE_URL_RE)) {
      const prev = m.index > 0 ? masked[m.index - 1] : '';
      if ('(["\''.indexOf(prev) !== -1) continue;
      out.push(hit(text, m, '裸 URL "' + short(m[0], 48) + '"，建议用 [文本](url) 形式'));
    }
    return out;
  }
});

// 12 — 中英标点混用
rule({
  id: 'mixed-punct', severity: 'info', description: '英文内容中使用中文标点',
  check: function (text) {
    const out = [];
    const masked = maskCode(text);
    for (const m of scan(masked, CN_PUNCT_RE)) {
      const ls = masked.lastIndexOf(NL, m.index) + 1;
      const le = masked.indexOf(NL, m.index);
      const line = masked.slice(ls, le === -1 ? masked.length : le);
      const latin = (line.match(/[A-Za-z]/g) || []).length;
      const cjk = (line.match(/[\u4e00-\u9fff]/g) || []).length;
      if (latin >= 20 && cjk === 0 && /[，。！？：；]/.test(line)) {
        out.push(hit(text, m, '英文内容中使用了中文标点 "' + m[0] + '"'));
        break;
      }
    }
    return out;
  }
});

// 13 — 中英文缺空格
rule({
  id: 'cjk-spacing', severity: 'info', description: '中英文之间建议加空格',
  check: function (text) {
    const out = [];
    const masked = maskCode(text);
    let count = 0;
    for (const m of scan(masked, CJK_LATIN_RE)) {
      count++;
      if (count > 5) break;
      out.push(hit(text, m, '中英文之间建议加空格: "' + m[0] + '"'));
    }
    return out;
  }
});

// 14 — 代码块缺语言标记
rule({
  id: 'code-lang', severity: 'info', description: '代码块缺少语言标记',
  check: function (text) {
    const out = [];
    const lines = text.split(NL);
    let inFence = false;
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^[ \t]*`{3,}[ \t]*(.*)$/);
      if (m) {
        if (!inFence) {
          inFence = true;
          if (m[1].trim() === '') {
            out.push(hit(text, { index: pos }, '代码块缺少语言标记，建议指定语言以便语法高亮'));
          }
        } else {
          inFence = false;
        }
      }
      pos += lines[i].length + 1;
    }
    return out;
  }
});

// 15 — 列表嵌套过深
rule({
  id: 'list-depth', severity: 'warning', description: '列表嵌套过深',
  check: function (text) {
    const out = [];
    for (const m of scan(text, LIST_RE)) {
      const indent = m[1].replace(/\t/g, '  ').length;
      if (indent >= 12) {
        out.push(hit(text, m, '列表嵌套过深（约 ' + Math.ceil(indent / 2) + ' 级），建议拆分'));
      }
    }
    return out;
  }
});

// 16 — 空列表项
rule({
  id: 'empty-list-item', severity: 'error', description: '空的列表项',
  check: function (text) {
    const out = [];
    for (const m of scan(text, EMPTY_LIST_RE)) {
      out.push(hit(text, m, '空的列表项，请补充内容或删除'));
    }
    return out;
  }
});

// 17 — 句子过长
rule({
  id: 'sentence-too-long', severity: 'info', description: '句子过长，降低可读性',
  check: function (text) {
    const out = [];
    for (const m of scan(maskCode(text), SENTENCE_RE)) {
      const s = m[0].trim();
      if (s.length > 160) {
        out.push(hit(text, m, '句子过长（' + s.length + ' 字符），建议拆分为短句'));
      }
    }
    return out;
  }
});

// 18 — 段落过长
rule({
  id: 'paragraph-bloat', severity: 'info', description: '段落过长，建议拆分',
  check: function (text) {
    const out = [];
    const lines = text.split(NL);
    let start = 0;
    let buf = 0;
    for (let i = 0; i <= lines.length; i++) {
      const empty = i === lines.length || lines[i].trim() === '';
      if (empty) {
        if (buf > 1200) {
          out.push({ message: '段落过长（' + buf + ' 字符），建议拆分为多个段落', line: start + 1, column: 1, snippet: short((lines[start] || '').trim(), 60) });
        }
        start = i + 1;
        buf = 0;
      } else {
        const t = lines[i].trim();
        const structural = /^\|/.test(t) || /^```/.test(t) || /^(?:[-*+]|\d+\.)\s/.test(t) || /^#{1,6}\s/.test(t);
        if (structural) {
          start = i + 1;
          buf = 0;
        } else {
          buf += lines[i].length + 1;
        }
      }
    }
    return out;
  }
});

// 19 — 连续全大写
rule({
  id: 'shout-caps', severity: 'warning', description: '连续全大写强调（视觉噪音）',
  check: function (text) {
    const out = [];
    for (const m of scan(maskCode(text), SHOUT_RE)) {
      if (SHOUT_OK.has(m[0])) continue;
      out.push(hit(text, m, '连续全大写 "' + m[0] + '"，建议改为正常大小写或粗体'));
    }
    return out;
  }
});

// 20 — Markdown 标记未闭合
// 覆盖四类：粗体 **、删除线 ~~、内联代码与围栏的反引号 run、链接的方括号
rule({
  id: 'unbalanced-markdown', severity: 'error', description: 'Markdown 标记未闭合',
  check: function (text) {
    const out = [];
    const masked = maskCode(text);

    // 粗体与删除线：出现次数为奇数即未闭合
    for (const one of [['**', /[*][*]/g, '粗体标记'], ['~~', /~~/g, '删除线标记']]) {
      let n = 0;
      let last = -1;
      for (const m of scan(masked, one[1])) { n++; last = m.index; }
      if (n % 2 === 1 && last >= 0) out.push(hit(text, { index: last }, '未闭合的' + one[2] + ' ' + one[0]));
    }

    // 内联代码与围栏：按反引号 run 配对，闭合 run 长度必须不小于开 run
    let open = null;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) !== 96) continue;
      let j = i;
      let len = 0;
      while (j < text.length && text.charCodeAt(j) === 96) { len++; j++; }
      if (open === null) open = { start: i, len: len };
      else if (len >= open.len) open = null;
      i = j - 1;
    }
    if (open !== null) {
      const bar = String.fromCharCode(96).repeat(open.len);
      out.push(hit(text, { index: open.start }, '未闭合的' + (open.len >= 3 ? '围栏代码块' : '内联代码标记') + ' ' + bar));
    }

    // 链接：方括号必须成对；] 紧跟 ( 时该行内的圆括号也必须成对
    let ob = 0;
    let cb = 0;
    let first = -1;
    for (let i = 0; i < masked.length; i++) {
      const ch = masked[i];
      if (ch === '[') {
        ob++;
        if (first < 0) first = i;
      } else if (ch === ']') {
        cb++;
        if (masked[i + 1] === '(') {
          const end = masked.indexOf(NL, i);
          const seg = masked.slice(i + 1, end === -1 ? masked.length : end);
          let o = 0;
          let c = 0;
          for (let k = 0; k < seg.length; k++) {
            if (seg[k] === '(') o++;
            else if (seg[k] === ')') c++;
          }
          if (o > c) out.push(hit(text, { index: i }, '链接目标括号未闭合：' + short(seg, 40)));
        }
      }
    }
    if (ob !== cb) out.push(hit(text, { index: first }, '中括号未配对（' + ob + ' 个 [ 对 ' + cb + ' 个 ]）'));

    return out;
  }
});

// 21 — 行尾空格
rule({
  id: 'trailing-space', severity: 'info', description: '行尾多余空格',
  check: function (text) {
    const out = [];
    const lines = text.split(NL);
    for (let i = 0; i < lines.length; i++) {
      if (/^[ \t]*$/.test(lines[i])) continue;
      const m = lines[i].match(/[ \t]+(?=\r?$)/);
      if (m) {
        out.push({ message: '行尾有 ' + m[0].length + ' 个多余空格', line: i + 1, column: m.index + 1, snippet: '' });
      }
    }
    return out;
  }
});

// 22 — 表格列数不一致
rule({
  id: 'table-misaligned', severity: 'warning', description: '表格列数不一致',
  check: function (text) {
    const out = [];
    const rows = scan(text, TABLE_RE);
    let prev = null;
    let prevLine = 0;
    for (const row of rows) {
      const lineNo = lineCol(text, row.index).line;
      if (prev !== null && lineNo === prevLine + 1) {
        const pc = prev[1].split('|').length;
        const cc = row[1].split('|').length;
        if (pc !== cc) {
          out.push(hit(text, row, '表格列数不一致（上一行 ' + pc + ' 列，此处 ' + cc + ' 列）'));
        }
      }
      prev = row;
      prevLine = lineNo;
    }
    return out;
  }
});

// 23 — 数字断言无来源
rule({
  id: 'number-without-source', severity: 'info', description: '数字断言未给出来源',
  check: function (text) {
    const out = [];
    for (const m of scan(maskCode(text), PCT_RE)) {
      const ls = text.lastIndexOf(NL, m.index) + 1;
      const le = text.indexOf(NL, m.index);
      const line = text.slice(ls, le === -1 ? text.length : le);
      if (/[hH]ttp|来源|数据|报告|研究|调查|统计|据|source|citation/i.test(line)) continue;
      out.push(hit(text, m, '数字断言 "' + short(m[0], 30) + '" 未给出来源'));
    }
    return out;
  }
});

// 24 — 文件末尾缺换行
rule({
  id: 'no-final-newline', severity: 'info', description: '文件末尾缺少换行符',
  check: function (text) {
    if (text.length === 0) return [];
    if (text.slice(-1) !== NL) {
      const lines = text.split(NL);
      return [{ message: '文件末尾缺少换行符', line: lines.length, column: lines[lines.length - 1].length + 1, snippet: '' }];
    }
    return [];
  }
});

// 25 — 日文内容使用半角标点
// 只有包含假名的行才检查，纯英文或纯中文文档不会触发；
// 一次只报一条，避免每篇日文文档刷出几十条重复提示。
rule({
  id: 'ja-halfwidth-punct', severity: 'info', description: '日文内容中使用半角标点',
  check: function (text) {
    const masked = maskUrls(maskCode(text));
    let total = 0;
    let first = null;
    for (const m of scan(masked, JA_HALF_PUNCT_RE)) {
      const ls = masked.lastIndexOf(NL, m.index) + 1;
      const le = masked.indexOf(NL, m.index);
      const line = masked.slice(ls, le === -1 ? masked.length : le);
      if (!KANA_RE.test(line)) continue;
      total++;
      if (first === null) first = m;
    }
    if (first === null) return [];
    return [hit(text, first, '日文内容中使用了半角标点（共 ' + total + ' 处），建议改用日文标点')];
  }
});

// 26 — 半角片假名与全角混用
// 通篇只用半角（技术文档的常见写法）不算问题，只在两种宽度混用时提示。
rule({
  id: 'ja-hankaku-kana', severity: 'info', description: '半角片假名与全角混用',
  check: function (text) {
    const masked = maskCode(text);
    const half = scan(masked, HANKAKU_KANA_RE);
    if (half.length === 0) return [];
    if (!ZENKAKU_KANA_RE.test(masked)) return [];
    return [hit(text, half[0], '半角片假名与全角片假名混用，建议统一为全角')];
  }
});

export { RULES };
