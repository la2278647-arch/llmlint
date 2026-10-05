#!/usr/bin/env node
'use strict';

// 性能基准。零依赖，只用 node:test 之外的内置模块。
// 用法: node bench/benchmark.mjs [--json]
//
// 数字只在同一台机器、同一个 Node 版本上有可比性。
// 想确认本仓库宣称的吞吐量，直接跑这条命令。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkDocument, RULES } from '../src/index.js';

const NL = String.fromCharCode(10);
const root = fileURLToPath(new URL('..', import.meta.url));
const asJson = process.argv.includes('--json');
const ROUNDS = 200;
const WARMUP = 10;

const readme = readFileSync(root + 'README.md', 'utf8');
const demoBad = readFileSync(root + 'examples/demo-bad.md', 'utf8');

// 用 README 反复拼接构造大文档，保持文本形态真实（不是随机字符）。
function bigDoc(targetKb) {
  let out = readme;
  while (out.length < targetKb * 1024) out = out + NL + readme;
  return out;
}

const targets = [
  { name: 'demo-bad.md', text: demoBad },
  { name: 'README.md', text: readme },
  { name: 'synthetic-64k', text: bigDoc(64) },
];

function bench(text) {
  for (let i = 0; i < WARMUP; i++) checkDocument(text);
  const samples = [];
  for (let i = 0; i < ROUNDS; i++) {
    const start = process.hrtime.bigint();
    checkDocument(text);
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  samples.sort(function (a, b) { return a - b; });
  return {
    median: samples[Math.floor(samples.length / 2)],
    min: samples[0],
    max: samples[samples.length - 1]
  };
}

const results = targets.map(function (t) {
  const t0 = Date.now();
  const timing = bench(t.text);
  const elapsed = Date.now() - t0;
  return {
    name: t.name,
    kb: Math.round(t.text.length / 1024 * 10) / 10,
    medianMs: Math.round(timing.median * 1000) / 1000,
    minMs: Math.round(timing.min * 1000) / 1000,
    maxMs: Math.round(timing.max * 1000) / 1000,
    elapsedMs: elapsed,
    msPerKb: Math.round((timing.median / (t.text.length / 1024)) * 1000) / 1000,
    docsPerSec: Math.round(1000 / timing.median)
  };
});

if (asJson) {
  console.log(JSON.stringify({
    node: process.version,
    rules: RULES.length,
    rounds: ROUNDS,
    results: results
  }, null, 2));
} else {
  console.log('llmlint benchmark');
  console.log('node ' + process.version + '  ' + RULES.length + ' rules  ' + ROUNDS + ' rounds each (median)');
  console.log('');
  console.log('target          kB   median(ms)   min   max   ms/KB   docs/sec');
  for (const r of results) {
    console.log([
      r.name.padEnd(15),
      String(r.kb).padStart(5),
      String(r.medianMs).padStart(11),
      String(r.minMs).padStart(7),
      String(r.maxMs).padStart(7),
      String(r.msPerKb).padStart(7),
      String(r.docsPerSec).padStart(9)
    ].join(''));
  }
  console.log('');
  const last = results[results.length - 1];
  console.log(last.name + ': ' + last.docsPerSec + ' docs/sec, ' + last.msPerKb + ' ms per KB');
}
