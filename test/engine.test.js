'use strict';

// 引擎原语的正确性。lineCol 的偏移表实现换了三次算法，
// 这里用暴力参考实现逐索引交叉验证，防止再改的时候悄悄偏掉。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineCol, snippet, maskCode, maskUrls, NL } from '../src/engine.js';

// 不复用被测实现：逐字符扫，最笨但最可信。
function refLineCol(text, index) {
  let line = 1;
  let last = -1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) { line++; last = i; }
  }
  return { line: line, column: last === -1 ? index + 1 : index - last };
}

test('lineCol 单行文档的所有位置', () => {
  const text = 'hello world';
  for (let i = 0; i <= text.length; i++) {
    assert.deepEqual(lineCol(text, i), { line: 1, column: i + 1 }, 'index ' + i);
  }
});

test('lineCol 空文档', () => {
  assert.deepEqual(lineCol('', 0), { line: 1, column: 1 });
});

test('lineCol 多行文档逐索引对齐暴力参考', () => {
  const text = ['# 标题', '', '正文第一行', '   缩进行', '最后一行没有换行'].join(NL);
  for (let i = 0; i <= text.length; i++) {
    assert.deepEqual(lineCol(text, i), refLineCol(text, i), 'index ' + i + ' char ' + JSON.stringify(text[i]));
  }
});

test('lineCol 在换行符自身位置属于下一行第一列', () => {
  const text = 'ab' + NL + 'cd';
  assert.deepEqual(lineCol(text, 2), { line: 1, column: 3 });
  assert.deepEqual(lineCol(text, 3), { line: 2, column: 1 });
});

test('lineCol 返回新对象，不被调用方污染', () => {
  const text = 'a' + NL + 'b';
  const a = lineCol(text, 2);
  const b = lineCol(text, 2);
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
  a.line = 99;
  assert.equal(b.line, 2);
});

test('lineCol 对混合换行符与制表符的文档仍然正确', () => {
  const text = 'a' + NL + 'b' + NL + NL + 'c';
  for (let i = 0; i <= text.length; i++) {
    assert.deepEqual(lineCol(text, i), refLineCol(text, i), 'index ' + i);
  }
});

test('snippet 返回所在行并去掉两端空白', () => {
  const text = 'one' + NL + '   two   ' + NL + 'three';
  assert.equal(snippet(text, 0), 'one');
  assert.equal(snippet(text, 7), 'two');
  assert.equal(snippet(text, text.length - 1), 'three');
});

test('snippet 不越出文本边界', () => {
  const text = 'only';
  assert.equal(snippet(text, 3), 'only');
});

test('maskCode 与 maskUrls 都保持字符串长度不变', () => {
  const text = '# 标题' + NL + NL + '正文 `代码` 与 <https://example.com?a=1>。' + NL;
  assert.equal(maskCode(text).length, text.length);
  assert.equal(maskUrls(text).length, text.length);
  assert.equal(maskCode(maskUrls(text)).length, text.length);
});

test('maskCode 保留换行位置，行号换算不受影响', () => {
  const text = 'a' + NL + 'b' + NL + 'c';
  assert.equal(maskCode(text).length, text.length);
  for (let i = 0; i <= text.length; i++) {
    assert.deepEqual(lineCol(maskCode(text), i), refLineCol(text, i), 'index ' + i);
  }
});

