# 贡献指南

感谢贡献。本项目保持零依赖、零网络、纯本地，请守住这个性质。

## 流程

从 `main` 拉分支，命名 `feat/<主题>`、`fix/<主题>` 或 `docs/<主题>`。

提交前本地验证：

```bash
node --test test/*.test.js
node src/cli.js check examples/demo-good.md
```

两者都必须通过。

## 新增规则

1. 在 `src/rules.js` 里调用 `rule()` 注册
2. 在 `test/rules.test.js` 的 `CASES` 数组加一个正向用例
3. 确认 `examples/demo-good.md` 依然零发现
4. 在 `README.md` 规则表补一行

规则接口：

```js
rule({
  id: 'my-rule',
  severity: 'info', // info | warning | error
  description: '一句话说明',
  check: function (text) {
    return [{ message: '描述问题', line: 1, column: 1, snippet: '原文片段' }];
  }
});
```

可用的辅助函数（从 `src/engine.js` 导入）：

- `lineCol(text, idx)` 把字符偏移换算成行列号
- `snippet(text, idx)` 取所在行的上下文
- `maskCode(text)` 屏蔽代码块与行内代码，避免在代码里误报
- `scan(text, re)` 全局扫描并返回所有匹配
- `NL` 换行符、`BT` 反引号

## 编码约定

- ESM，文件首行 `'use strict'`
- 不引入任何第三方包
- 兼容 Node 18，不用 ES2022+ 语法
- 注释用中文，标识符用英文

## PR 要求

- 一个 PR 解决一件事
- 说明动机与实际影响
- 新增规则必须带测试
