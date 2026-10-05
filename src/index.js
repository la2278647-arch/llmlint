'use strict';

import { RULES } from './rules.js';
import { scoreFindings, severityOrder } from './score.js';
import { fixDocument, FIXABLE } from './fix.js';

/**
 * 检查一段文本，返回发现列表与评分。
 *
 * @param {string} text 待检查文本
 * @param {object} [options]
 * @param {string[]} [options.enable]   只运行这些规则
 * @param {string[]} [options.disable]  跳过这些规则
 * @param {string}   [options.minSeverity] info | warning | error
 * @param {number}   [options.maxFindings]  最多返回多少条发现；只影响返回数量，不影响评分
 * @param {object}   [options.severity]     规则 id 到严重度的覆盖映射
 */
export function checkDocument(text, options) {
  const opts = options || {};
  const disabled = opts.disable || [];
  const enabled = opts.enable || [];
  const sevMap = opts.severity || {};
  const threshold = severityOrder(opts.minSeverity || 'info');
  const max = opts.maxFindings || 0;
  const all = [];
  const stats = {};

  for (const ruleDef of RULES) {
    const severity = Object.prototype.hasOwnProperty.call(sevMap, ruleDef.id) ? sevMap[ruleDef.id] : ruleDef.severity;
    let skip = false;
    if (disabled.indexOf(ruleDef.id) !== -1) skip = true;
    if (!skip && enabled.length > 0 && enabled.indexOf(ruleDef.id) === -1) skip = true;
    if (!skip && severityOrder(severity) < threshold) skip = true;
    if (skip) { stats[ruleDef.id] = 'skipped'; continue; }

    let results = [];
    try { results = ruleDef.check(text) || []; } catch (err) { results = []; }
    stats[ruleDef.id] = results.length;

    for (const finding of results) {
      all.push({
        rule: ruleDef.id,
        severity: severity,
        message: finding.message,
        line: finding.line || 0,
        column: finding.column || 0,
        snippet: finding.snippet || ''
      });
    }
  }

  all.sort(function (a, b) { return (a.line - b.line) || (a.column - b.column); });
  // maxFindings 只截断返回给调用方的数量；评分按全部发现算，
  // 否则一份问题很多的文档会因为只报了前几条而拿到虚高的分数。
  const findings = max > 0 ? all.slice(0, max) : all;
  const checked = Object.keys(stats).filter(function (k) { return stats[k] !== 'skipped'; }).length;

  return {
    findings: findings,
    score: scoreFindings(all),
    stats: stats,
    summary: { rules: RULES.length, checked: checked }
  };
}

export { RULES, scoreFindings, severityOrder, fixDocument, FIXABLE };
export { loadConfig, parseConfig, resolveOptions, effectiveOptions, globMatch, normalizePath, ConfigError } from './config.js';
export default checkDocument;
