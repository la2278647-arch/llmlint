'use strict';

// =====================================================================
// llmlint 引擎内核 — 行号计算、代码屏蔽、正则常量、规则注册表
// =====================================================================

const NL = String.fromCharCode(10);
const BT = String.fromCharCode(96);

function lineCol(text, index) {
  const before = text.slice(0, index);
  const line = before.split(NL).length;
  const nl = before.lastIndexOf(NL);
  const column = nl === -1 ? index + 1 : index - nl;
  return { line: line, column: column };
}

function snippet(text, index) {
  const start = text.lastIndexOf(NL, Math.max(0, index - 1)) + 1;
  const end = text.indexOf(NL, start);
  return (end === -1 ? text.slice(start) : text.slice(start, end)).trim();
}

function scan(text, re) {
  const out = [];
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

const NON_NL_RE = /[^\n]/g;
function blank(s) { return s.replace(NON_NL_RE, ' '); }

const FENCE_BLOCK_RE = /^[ \t]*```+[^\n]*\n[\s\S]*?^[ \t]*```+[ \t]*$/gm;
const INLINE_CODE_RE = /`[^\n`]+[`]/g;
const FENCE_LINE_RE = /^[ \t]*```+[ \t]*$/gm;

function maskCode(text) {
  return text.replace(FENCE_BLOCK_RE, blank).replace(INLINE_CODE_RE, blank);
}

// 屏蔽 URL：URL 里的 ?, . 等字符属于地址的一部分，不该被当成标点问题。
const URL_MASK_RE = new RegExp('https?:\\/\\/[^\\s<>' + BT + ']*', 'g');
function maskUrls(text) {
  return text.replace(URL_MASK_RE, blank);
}

// ---------- 正则常量 ----------

const PLACEHOLDER_RE = /\b(?:TODO|FIXME|TBD|XXX)\b|lorem\s*ipsum|\[\s*(?:待补充|TODO|TBD)\s*\]|待填写|\{\{[^}]+\}\}/gi;
const FILLER_RE = /(总的来说|综上所述|值得一提的是|换句话说|换言之|事实上|显然|众所周知|不言而喻|说白了|简而言之|\bit is important to note\b|\bin conclusion\b|\bat the end of the day\b|\bneedless to say\b)/gi;
const HEDGE_RE = /(可能|也许|大概|或许|某种程度上|某种意义上|似乎|大约|差不多|一般来说|在一定程度上|\bmaybe\b|\bperhaps\b|\bsort of\b|\bkind of\b|\barguably\b|\bto some extent\b)/gi;
const OVERCLAIM_RE = /(总是|永远|绝对是|绝对能|绝对不会|绝对正确|绝对安全|必然|毫无疑问|万无一失|零风险|100%[^\n]{0,4}?(?:安全|正确|有效)|\bguaranteed\b|\bproven to\b|\balways works?\b|\bnever fails?\b|\bwithout exception\b|\bflawless\b)/gi;
const SUPERLATIVE_RE = /(革命性|颠覆性|业界领先|世界一流|前所未有|最强|最佳|终极|神器|王牌|\bgame[- ]changing\b|\brevolutionary\b|\bworld[- ]class\b|\bultimate\b|\bunprecedented\b|\bcutting[- ]edge\b|\bstate[- ]of[- ]the[- ]art\b)/gi;
const VAGUE_TIME_RE = /(上周|最近|近期|不久前|前几天|几天前|不久之前|\blast week\b|\bjust recently\b|\ba few days ago\b|\bnot long ago\b)/gi;
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;
const CJK_LATIN_RE = /[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/g;
const CN_PUNCT_RE = /[，。！？：；]/g;
// 日文：假名用于门控，只有出现假名的行才检查，纯英文行不受影响。
const KANA_RE = /[\u3040-\u309F\u30A0-\u30FF]/;
// 半角标点：逗号句号排除数字两侧（小数与千分位），句号再排除省略号。
const JA_HALF_PUNCT_RE = /(?<!\d)[!?]|(?<!\d),(?!\d)|(?<!\d)(?<!\.)\.(?!\.)(?!\d)/g;
// 半角片假名与全角片假名：只在两者同时出现时才算混用。
const HANKAKU_KANA_RE = /[\uFF65\uFF66-\uFF9F\uFFE0]/g;
const ZENKAKU_KANA_RE = /[\u30A0-\u30FF\u30FB]/;
const HEADING_RE = /^[ \t]*#{1,6}[ \t]+(.+?)[ \t]*$/gm;
const BARE_URL_RE = new RegExp('https?:\\/\\/[^\\s<>' + BT + '\\[\\]()""\' ]+', 'g');
const LIST_RE = /^([ \t]*)(?:[-*+]|\d+\.)[ \t]+/gm;
const EMPTY_LIST_RE = /^([ \t]*)[-*+][ \t]*$/gm;
const TABLE_RE = /^\|(.+)\|$/gm;
const SENTENCE_RE = /[^。！？.!?\n]{18,}/g;
const TRAILING_RE = /[ \t]+$/g;
const SHOUT_RE = /\b[A-Z]{4,}\b/g;
const PCT_RE = /(提升|增长|下降|提高|降低|节省|增加|减少|翻倍)[^。！？.!?\n]{0,6}?\d+(?:\.\d+)?%|\d+(?:\.\d+)?%\s*(?:的用户|的客户|的性能|的速度|的效率|的转化|的留存)/g;

const SHOUT_OK = new Set(['API','MCP','JSON','HTTP','HTTPS','HTML','CSS','README','TODO','FIXME','CLI','SDK','AI','LLM','GPT','YAML','TOML','UTF','URL','URI','UUID','SQL','IDE','OOP','REST','W3C','WCAG','NODE','NPM','GITHUB','MARKDOWN','ESLINT','PRETTIER','TRUE','FALSE','NULL','UNDEFINED','VERSION','RELEASE','LICENSE','CHANGELOG','CONTRIBUTING','SECURITY','FUNDING','DEPRECATED','STABLE','BETA','ALPHA','MAIN','MASTER','DEFAULT','PATCH','MINOR','MAJOR','BREAKING','TOKEN','MODEL','AGENT','SERVER','CLIENT','PLUGIN','MODULE','PACKAGE','CONTENT','PLATFORM','TEMPLATE','REPORT','STANDARD','WARNING','ERROR','CAPS']);

const RULES = [];
function rule(def) { RULES.push(def); return def; }

export { NL, BT, lineCol, snippet, scan, blank, maskCode, maskUrls, RULES, rule, PLACEHOLDER_RE, FILLER_RE, HEDGE_RE, OVERCLAIM_RE, SUPERLATIVE_RE, VAGUE_TIME_RE, EMOJI_RE, CJK_LATIN_RE, CN_PUNCT_RE, KANA_RE, JA_HALF_PUNCT_RE, HANKAKU_KANA_RE, ZENKAKU_KANA_RE, HEADING_RE, BARE_URL_RE, LIST_RE, EMPTY_LIST_RE, TABLE_RE, SENTENCE_RE, TRAILING_RE, SHOUT_RE, PCT_RE, SHOUT_OK, FENCE_LINE_RE };
