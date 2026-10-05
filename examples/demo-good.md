# llmlint 快速上手

llmlint 检查 AI 生成的 Markdown 文本，找出空洞词、绝对化断言和格式错误。

## 环境要求

Node.js 18 及以上版本，无需其他依赖。

## 安装

```bash
npm install llmlint
```

## 检查文件

```bash
npx llmlint check notes.md
```

## 评分规则

| 严重度 | 权重 |
| --- | --- |
| error | 10 |
| warning | 5 |
| info | 2 |

## 下一步

阅读 CONTRIBUTING.md 了解如何贡献新规则。
