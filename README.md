# llmlint [![release](https://img.shields.io/github/v/release/la2278647-arch/llmlint)](https://github.com/la2278647-arch/llmlint/releases) [![license](https://img.shields.io/github/license/la2278647-arch/llmlint)](LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/) [![deps](https://img.shields.io/badge/runtime%20deps-0-orange)](https://github.com/la2278647-arch/llmlint)

**给 AI 写的文本做体检。** 24 条规则、0-100 评分、CLI + MCP server，零依赖、纯本地运行。

- 语言：[README](README.md) · [English](README.en.md)
- 许可：MIT
- 依赖：0（仅使用 Node 内置模块）

---

## 为什么需要

你让 AI 写完了周报、文档、博客、PR 描述。它能写，但不代表写得对。常见问题：

- **占位符残留**：交付物里还有 `TODO`、`待补充`
- **空话套话**：一堆 `综上所述`、`值得一提的是`，信息密度为零
- **不可验证的断言**：`总是有效`、`100% 安全`、`提升了 45%` 却没有来源
- **模糊时间**：`上周`、`最近` ——具体是哪天？
- **格式烂**：标题跳级、表格错列、代码块没写语言、行尾一堆空格
- **语气漂移**：限定词堆成山，或者连续全大写喊口号

这些都不是语法错误，任何 Markdown 解析器都不会报。但它们是内容可信度的直接杀手。

llmlint 就是补这个洞的。

## 特性

- **24 条规则**，中英双语，针对 LLM 输出的真实失败模式
- **0-100 评分 + A-F 等级**，按严重度加权扣分
- **精确到行列**，每条发现带行号、列号、原文片段，可直接跳转
- **代码块自动屏蔽**，规则不会在代码里误报
- **CLI 四种命令**，text / md / json 三种输出
- **CI 友好退出码**，有 error 返回 2
- **MCP server**，3 个工具，手写 stdio JSON-RPC，不用官方 SDK
- **零依赖、纯本地**，文本不出机器

## 安装

```bash
npm install llmlint
```

或用 npx 直接跑：

```bash
npx llmlint --help
```

要求 Node.js 18 及以上。

## 快速开始

```bash
llmlint check README.md
```

输出：

```text
llmlint — README.md

评分    90/100  等级 A
问题    5 条（error 0 / warning 2 / info 3）
规则    24/24

--- 问题明细 ---

!  14:1    trailing-space  [info]
      行尾有 2 个多余空格
i  87:23   cjk-spacing  [info]
      中英文之间建议加空格
```

只看分数（适合挂在 PR 里）：

```bash
llmlint score README.md
# README.md  90/100  A  5 findings
```

看完整规则清单：

```bash
llmlint rules
```

## 24 条规则

| 规则 | 严重度 | 检查什么 |
| --- | --- | --- |
| `placeholder-text` | error | 残留 `TODO`、`FIXME`、`待补充`、`{{var}}` |
| `empty-list-item` | error | 空的列表项 `- ` |
| `unbalanced-markdown` | error | 未闭合的 `**` |
| `filler-words` | warning | 空洞词超过阈值（>5 处） |
| `overclaim` | warning | `总是`、`100% 安全` 等不可证伪断言 |
| `marketing-superlative` | warning | `革命性`、`神器`、`终极` 等营销词 |
| `vague-time` | warning | `上周`、`最近` 等模糊时间 |
| `repetition` | warning | 重复出现的长句 |
| `heading-jump` | warning | 标题层级跳级（H1 直接到 H3） |
| `repeated-heading` | warning | 重复的标题文本 |
| `list-depth` | warning | 列表嵌套超过 6 级 |
| `shout-caps` | warning | 连续全大写强调 |
| `table-misaligned` | warning | 表格各行列数不一致 |
| `hedge-words` | info | 限定词过多（>8 处） |
| `emoji-sprawl` | info | emoji 过多（>8 个） |
| `bare-url` | info | 裸 URL 未包成链接 |
| `mixed-punct` | info | 英文内容里混用中文标点 |
| `cjk-spacing` | info | 中英文之间缺空格 |
| `code-lang` | info | 代码块缺语言标记 |
| `sentence-too-long` | info | 句子超过 160 字符 |
| `paragraph-bloat` | info | 段落超过 1200 字符 |
| `trailing-space` | info | 行尾多余空格 |
| `number-without-source` | info | 百分比数字断言没给来源 |
| `no-final-newline` | info | 文件末尾缺换行 |

## 评分

100 分起算，每条发现按严重度扣分：

| 严重度 | 扣分 |
| --- | --- |
| error | 10 |
| warning | 5 |
| info | 2 |

最低 0 分。等级：A ≥ 90，B ≥ 80，C ≥ 70，D ≥ 60，F < 60。

## 过滤与阈值

```bash
# 只看 warning 及以上
llmlint check README.md --min-severity warning

# 只跑几条规则
llmlint check README.md --enable placeholder-text,overclaim

# 跳过某些规则
llmlint check README.md --disable trailing-space,cjk-spacing

# 最多报 20 条
llmlint check README.md --max 20

# 有 warning 就让 CI 失败
llmlint check README.md --fail-on warning

# 输出 JSON 或 Markdown 报告
llmlint check README.md --format json
llmlint check README.md --format md --output report.md
```

## 作为库使用

```js
import { checkDocument } from 'llmlint';

const result = checkDocument(text, { minSeverity: 'warning' });
console.log(result.score);      // { score: 85, grade: 'B', counts: {...} }
console.log(result.findings);   // [{ rule, severity, message, line, column, snippet }]
```

## MCP server

给 Claude Code、Cursor 等 MCP 客户端用。手写 stdio JSON-RPC 2.0，没有引入官方 SDK：

```json
{
  "mcpServers": {
    "llmlint": {
      "command": "node",
      "args": ["/path/to/llmlint/src/mcp/server.js"]
    }
  }
}
```

三个工具：

| 工具 | 作用 |
| --- | --- |
| `lint_document` | 检查一段文本，返回评分与问题清单 |
| `lint_file` | 检查本地文件 |
| `list_rules` | 列出全部规则与严重度 |

## CI 集成

完整模板在 `examples/github-actions.yml`，复制到 `.github/workflows/` 即可启用。最简步骤：

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '22.x' }
- run: node src/cli.js check 'docs/**/*.md' --fail-on warning
```

退出码：0 = 干净，1 = 达到 `--fail-on` 阈值，2 = 有 error。

## 设计原则

1. **零依赖**。不用官方 MCP SDK，不引依赖。安装体积接近零，供应链攻击面为零。
2. **文本不出机器**。本地纯字符串处理，不请求任何服务，不发送遥测。
3. **误报比漏报更贵**。规则里对代码块、行内代码、链接语法、常见缩写都做了屏蔽和白名单。
4. **发现必须可定位**。每条问题都有行号列号和原文片段。
5. **规则可插拔**。加一条规则只需在 `src/rules.js` 里注册，并在测试里补一个正向用例。

## 项目结构

```text
src/
  engine.js      行号换算、代码屏蔽、正则常量、规则注册表
  rules.js       24 条规则实现
  score.js       评分与等级
  index.js       checkDocument() 入口
  cli.js         命令行
  mcp/server.js  MCP 服务端
test/
  rules.test.js  规则与评分测试（39 个）
  mcp.test.js    MCP 协议测试（9 个）
examples/
  demo-good.md   零发现的干净文档
  demo-bad.md    24 条问题全触发
```

## 路线图

- [ ] 自动修复（`--fix`）：行尾空格、中英文空格、文件末尾换行
- [ ] 自定义规则配置文件（`.llmlintrc`）
- [ ] 增量检查：只检查变更的行
- [ ] 更多语言支持（日文、韩文、法文）
- [ ] 规则插件机制
- [ ] 与 GitHub Actions 集成的 scorecard 格式输出

## 参与

欢迎 PR。规则、测试、文档的改动都会合并。见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

[MIT](LICENSE) — 随便用，出问题自己负责。
