# llmlint [![release](https://img.shields.io/github/v/release/la2278647-arch/llmlint)](https://github.com/la2278647-arch/llmlint/releases) [![license](https://img.shields.io/github/license/la2278647-arch/llmlint)](LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/) [![deps](https://img.shields.io/badge/runtime%20deps-0-orange)](https://github.com/la2278647-arch/llmlint)

**给 AI 写的文本做体检。** 26 条规则、0-100 评分、CLI + MCP server，零依赖、纯本地运行。

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

- **26 条规则**，中英双语，针对 LLM 输出的真实失败模式
- **0-100 评分 + A-F 等级**，按严重度加权扣分
- **精确到行列**，每条发现带行号、列号、原文片段，可直接跳转
- **代码块自动屏蔽**，规则不会在代码里误报
- **CLI 四种命令**，text / md / json 三种输出
- **CI 友好退出码**，有 error 返回 2
- **MCP server**，5 个工具含自动修复，手写 stdio JSON-RPC，不用官方 SDK
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
规则    26/26

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

## 26 条规则

| 规则 | 严重度 | 检查什么 |
| --- | --- | --- |
| `placeholder-text` | error | 残留 `TODO`、`FIXME`、`待补充`、`{{var}}` |
| `empty-list-item` | error | 空的列表项 `- ` |
| `unbalanced-markdown` | error | 未闭合的 `**`、`~~`、内联代码、围栏、链接括号 |
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
| `ja-halfwidth-punct` | info | 日文内容里用半角 `,` `.` `!` `?` |
| `ja-hankaku-kana` | info | 半角片假名与全角片假名混用 |

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

## 自动修复

三条规则是纯机械变换，`--fix` 直接改写源文件，然后照常评分：

```bash
llmlint check README.md --fix
cat README.md | llmlint check --fix -

# 只报告将改什么，不动文件
llmlint check README.md --fix --dry-run
```

| 规则 | 做法 |
| --- | --- |
| `trailing-space` | 删掉行尾空格与制表符 |
| `cjk-spacing` | 中文与字母数字之间补一个空格 |
| `no-final-newline` | 末尾补一个换行 |

代码块与行内代码一律跳过，`CRLF` 换行原样保留，重复运行不会继续改动。修不了的规则照常报告，退出码仍按 `--fail-on` 计算。

## 项目级配置

规则集应该进版本库，而不是靠命令行维护。在仓库根目录放一个 `llmlint.json` 或 `.llmlintrc.json`，从当前目录向上逐级查找，找到第一个即用：

```json
{
  "min-severity": "warning",
  "max-findings": 100,
  "rules": [
    { "path": ["**/*.md"], "disable": ["cjk-spacing"] },
    { "path": ["docs/**"], "min-severity": "info" }
  ]
}
```

配置项有 `min-severity`、`max-findings`、`fail-on`、`enable`、`disable`、`severity`。其中 `severity` 可以改一条规则的严重度，扣分与阈值会跟着变：

```json
{ "severity": { "sentence-too-long": "error" } }
```

`rules` 数组按声明顺序合并，后面的标量覆盖前面的，`enable` 与 `disable` 取并集。`path` 数组是或关系，省略 `path` 的块对任何文件生效。`**` 匹配零个或多个路径段，`*` 与 `?` 不跨 `/`。

优先级是命令行参数大于配置文件大于默认值。命令行传了 `--enable` 时视为白名单，配置里的 `--disable` 不再适用。

配置写错会立刻报出来，并指出第几行第几列和原因：

```bash
llmlint check README.md
# llmlint.json: 不是合法 JSON（第 3 行 2 列）：Unexpected token ...

llmlint config README.md      # 看实际生效的设置
llmlint check --config l.json # 指定配置文件
llmlint check --no-config f.md # 跳过查找
```


### 日文文档预设

日文项目通常要关掉 `cjk-spacing`，日文里假名与拉丁字符之间不加空格。日文那两条规则不用显式开启，它们自带假名门控：

``` json
{
  "rules": [
    { "path": ["**/*.md"], "disable": ["cjk-spacing"] }
  ]
}
```

`cjk-spacing` 只在汉字与拉丁字符相邻时报，假名与拉丁相邻不算问题。`ja-halfwidth-punct` 只在行内出现假名时才检查。所以中日英混排的仓库不需要任何配置。

示例目录里的 `demo-ja.md` 是一份零发现的日文文档，可以用它确认规则没有误报。
## 增量检查

只关心「这次改动引入了什么新问题」。`diff` 跑完整检查，再按 git 的改动行范围把发现拆成两组：新增问题扣分并决定退出码，遗留问题只在报告里给数量。

```bash
llmlint diff                       # 自动检查变更文件与新增的未跟踪文件
llmlint diff docs/a.md             # 只看指定文件
llmlint diff --base origin/main    # 指定对比基准
```

```text
llmlint diff — docs/a.md

评分    98/100  等级 A
新增    1 条   遗留 1 条（不扣分）
规则    26/26
```

改动范围取自 `git diff --unified=0` 的分段头，纯删除的分段不产生范围，新增文件整份都算新增。未跟踪但未被忽略的文件也会检查，命中 `.gitignore` 的一律跳过。

`diff` 复用配置文件与命令行参数，所以按路径分区的规则集、`severity` 覆盖和 `--fail-on` 都照样生效。不支持 `--fix`：修复会改写历史行，新增与遗留的划分就不成立了。

## 作为库使用

```js
import { checkDocument, fixDocument } from 'llmlint';

const result = checkDocument(text, { minSeverity: 'warning' });
console.log(result.score);      // { score: 85, grade: 'B', counts: {...} }
console.log(result.findings);   // [{ rule, severity, message, line, column, snippet }]

const fixed = fixDocument(text);   // 只处理能机械修复的三条
console.log(fixed.fixes);          // [{ rule: 'cjk-spacing', count: 4 }]
console.log(fixed.text);
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

五个工具：

| 工具 | 作用 |
| --- | --- |
| `lint_document` | 检查一段文本，返回评分与问题清单 |
| `lint_file` | 检查本地文件 |
| `list_rules` | 列出全部规则与严重度 |
| `fix_document` | 自动修复文本，返回修复后的内容 |
| `fix_file` | 自动修复本地文件并返回内容，不写回文件 |

`fix_document` 一次回给调用方四样东西：修了哪些规则、修复前后的分数、还剩什么问题、哪些规则可自动修：

``` json
{
  "changed": true,
  "text": "这是一段中文 English 混排。\n",
  "changes": [{"rule": "cjk-spacing", "count": 2}],
  "scoreBefore": {"score": 94, "grade": "A"},
  "scoreAfter": {"score": 100, "grade": "A"},
  "remaining": [],
  "fixable": ["trailing-space", "cjk-spacing", "no-final-newline"]
}
```

分数对象里另外还有 `counts`（各严重度条数）与 `penalty`（总扣分）。

可自动修复的只有行尾空格、中英文空格、末尾换行三条，其余问题需要人工判断，会留在 `remaining` 里。LLM 写完一段文本，一次调用就能拿到分数、能自动修的部分、以及剩下的问题。

## CI 集成

完整模板在 `examples/github-actions.yml`，复制到 `.github/workflows/` 即可启用。最简步骤：

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '22.x' }
- run: node src/cli.js check 'docs/**/*.md' --fail-on warning
```

退出码：0 = 干净，1 = 达到 `--fail-on` 阈值，2 = 有 error。

PR 门禁更适合用增量检查，只拦新引入的问题，历史遗留不阻塞合并：

```yaml
- run: node src/cli.js diff --base origin/main --fail-on warning
```

## 设计原则

1. **零依赖**。不用官方 MCP SDK，不引依赖。安装体积接近零，供应链攻击面为零。
2. **文本不出机器**。本地纯字符串处理，不请求任何服务，不发送遥测。
3. **误报比漏报更贵**。规则里对代码块、行内代码、链接语法、常见缩写都做了屏蔽和白名单。
4. **发现必须可定位**。每条问题都有行号列号和原文片段。
5. **规则可插拔**。加一条规则只需在 `src/rules.js` 里注册，并在测试里补一个正向用例。
6. **语言规则先做门控**。日文两条规则只在行内出现假名时才检查，中日英混排的文档不会被误报；代码块、行内代码、URL 一律先屏蔽。

日文两条规则的取舍：`ja-halfwidth-punct` 排除数字两侧的小数点与千分位逗号、排除省略号，一次只报一条，避免每篇日文文档刷出几十条重复提示。`ja-hankaku-kana` 只在半角与全角片假名同时出现时报，通篇只用半角（技术文档常见写法）不算问题。

## 项目结构

```text
src/
  engine.js      行号换算、代码屏蔽、正则常量、规则注册表
  rules.js       26 条规则实现
  score.js       评分与等级
  fix.js         可机械修复的三条规则
  config.js      配置发现、glob 分区与选项合并
  diff.js        改动行范围解析与新增遗留拆分
  index.js       checkDocument() 入口
  cli.js         命令行
  mcp/server.js  MCP 服务端
test/
  rules.test.js      规则与评分（63）
  cli-format.test.js 输出格式与错误路径（9）
  fix.test.js        自动修复（26）
  config.test.js     配置与优先级（43）
  diff.test.js       增量检查（27）
  mcp.test.js        协议（23）
examples/
  demo-good.md   零发现的干净文档
  demo-ja.md     零发现的日文文档
  demo-bad.md    14 条规则、25 条发现
  fix-target.md  修复前后的对照
```

## 路线图

- [x] 自动修复（`--fix`）：行尾空格、中英文空格、文件末尾换行
- [x] 项目级配置文件（`llmlint.json` / `.llmlintrc.json`）
- [x] 增量检查（`diff`）：只拦新引入的问题
- [ ] 更多语言支持（日文、韩文、法文）
- [ ] 阈值调优指南
- [ ] 容器化：交付前必须先在 CI 里实际构建并校验
- [ ] GitHub Pages 示例站

## 参与

欢迎 PR。规则、测试、文档的改动都会合并。见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

[MIT](LICENSE) — 随便用，出问题自己负责。
