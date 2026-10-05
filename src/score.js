'use strict';

// 评分：按严重度加权扣分，100 分起算，0 分封顶。

const WEIGHT = { info: 2, warning: 5, error: 10 };

export function severityOrder(sev) {
  if (sev === 'error') return 2;
  if (sev === 'warning') return 1;
  return 0;
}

export function scoreFindings(findings) {
  const counts = { error: 0, warning: 0, info: 0 };
  let penalty = 0;
  for (const f of findings) {
    const sev = Object.prototype.hasOwnProperty.call(counts, f.severity) ? f.severity : 'info';
    counts[sev] += 1;
    penalty += WEIGHT[sev] || 0;
  }
  const score = Math.max(0, 100 - penalty);
  let grade = 'F';
  if (score >= 90) grade = 'A';
  else if (score >= 80) grade = 'B';
  else if (score >= 70) grade = 'C';
  else if (score >= 60) grade = 'D';
  return { score: score, grade: grade, counts: counts, penalty: penalty };
}
