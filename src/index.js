'use strict';

import { RULES } from './rules.js';
import { scoreFindings, severityOrder } from './score.js';

/**
 * 检查一段文本，返回发现列表与评分。
 *
 * @param {string} text 待检查文本
 * @param {object} [options]
 * @param {string[]} [options.enable]   只运行这些规则
 * @param {string[]} [options.disable]  跳过这些规则
 * @param {string}   [options.minSeverity] info | warning | error
 * @param {number}   [options.maxFindings]  最多返回多少条发现
 */
export function checkDocument(text, options) {
  const opts = options || {};
  const disabled = opts.disable || [];
  const enabled = opts.enable || [];
  const threshold = severityOrder(opts.minSeverity || 'info');
  const max = opts.maxFindings || 0;
  const findings = [];
  const stats = {};

  for (const ruleDef of RULES) {
    let skip = false;
    if (disabled.indexOf(ruleDef.id) !== -1) skip = true;
    if (!skip && enabled.length > 0 && enabled.indexOf(ruleDef.id) === -1) skip = true;
    if (!skip && severityOrder(ruleDef.severity) < threshold) skip = true;
    if (skip) { stats[ruleDef.id] = 'skipped'; continue; }

    let results = [];
    try { results = ruleDef.check(text) || []; } catch (err) { results = []; }
    stats[ruleDef.id] = results.length;

    for (const finding of results) {
      if (max > 0 && findings.length >= max) break;
      findings.push({
        rule: ruleDef.id,
        severity: ruleDef.severity,
        message: finding.message,
        line: finding.line || 0,
        column: finding.column || 0,
        snippet: finding.snippet || ''
      });
    }
  }

  findings.sort(function (a, b) { return (a.line - b.line) || (a.column - b.column); });
  const checked = Object.keys(stats).filter(function (k) { return stats[k] !== 'skipped'; }).length;

  return {
    findings: findings,
    score: scoreFindings(findings),
    stats: stats,
    summary: { rules: RULES.length, checked: checked }
  };
}

export { RULES, scoreFindings, severityOrder };
export default checkDocument;
