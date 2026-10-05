# 更新日志

本项目遵循语义化版本与 Keep a Changelog。

## [0.4.0] - 2026-10-05

### 新增

**增量检查 `llmlint diff`**

- 新增 `diff` 命令：跑完整检查，再按 git 的改动行范围把发现拆成新增与遗留两组
- 只有新增问题扣分并决定退出码，遗留问题只在报告里给数量
- 不指定文件时自动检查变更过的文件与新增的未跟踪文件，命中 `.gitignore` 的一律跳过
- `--base <ref>` 指定对比基准，默认 `HEAD`
- text / md / json 三种输出，json 里 `added` 与 `existing` 分开
- 库入口新增 `changedRanges` / `splitFindings` / `changedFiles` / `untrackedFiles` / `DiffError`，`./diff` 子路径同样可用

**CI 模板**

- `examples/github-actions.yml` 增加增量检查步骤，验证新增问题会让流水线失败

### 变更

- 格式化输出改为复用同一套发现渲染与表格 helper，去掉 `check` 与 `diff` 之间的重复
- `diff` 不支持 `--fix`：修复会改写历史行，新增与遗留的划分就不成立了
- `diff` 不支持标准输入：读不到对比版本
- 测试套件从 115 项扩到 141 项

## [0.3.0] - 2026-10-05

### 新增

**项目级配置**

- 支持 `llmlint.json` 与 `.llmlintrc.json`，从当前目录向上逐级查找，找到第一个即停
- `rules` 数组按路径 glob 分区，按声明顺序合并，后面的标量覆盖前面的
- 配置文件里的 `severity` 可覆盖任意规则的严重度，连带影响扣分与 `--min-severity` 阈值
- `--config <file>` 指定配置文件，`--no-config` 完全跳过查找
- 新增 `llmlint config [path]` 命令，输出配置文件位置、命中的规则块与合并后的生效选项
- 库入口新增 `loadConfig` / `parseConfig` / `resolveOptions` / `effectiveOptions` / `globMatch` / `ConfigError`，`./config` 子路径同样可用

**错误提示**

- 配置不是合法 JSON 时报出第几行第几列与原因
- 未知配置项、未知规则 id、非法严重度、非法 `max-findings` 全部给出明确错误并以非零退出

### 变更

- 命令行参数优先级明确为：命令行 > 配置文件 > 默认值
- 命令行传了 `--enable` 时视为白名单，配置里的 `--disable` 不再适用，避免两者互相抵消
- `checkDocument` 新增 `severity` 选项
- 文本与 Markdown 报告末尾显示本次使用的配置文件
- 测试套件从 74 项扩到 115 项

## [0.2.0] - 2026-10-05

### 新增

**自动修复**

- `--fix` 原地修复可机械处理的规则，随后照常评分
- `--fix --dry-run` 只报告将改什么，不写磁盘
- 库入口新增 `fixDocument` 与 `FIXABLE`，`./fix` 子路径同样可用
- `trailing-space` 现在识别 `CRLF` 行尾，行号列号定位统一按匹配起点计算

**示例**

- 新增 `examples/fix-target.md`，用于展示修复前后的评分对比

### 变更

- `--fix` 支持 `-` 作为标准输入，此时只输出修好的内容
- JSON 报告新增 `fixes` 字段，记录本次实际应用的修复
- 测试套件从 48 项扩到 74 项

## [0.1.0] - 2026-10-05

首次发布。

### 新增

**规则**（24 条）

- 占位符残留、空洞词、过度限定、绝对化断言、营销夸张词
- 模糊时间、重复句、emoji 过量、标题跳级、重复标题
- 裸链接、标点混用、中英文缺空格、代码块缺语言
- 列表过深、空列表项、长句、长段落、连续全大写
- Markdown 标记未闭合、行尾空格、表格错列
- 数字无来源、文件末尾缺换行

**评分**

- 0-100 分，A / B / C / D / F 五级
- 按严重度加权：error 扣 10、warning 扣 5、info 扣 2

**CLI**

- `check` / `score` / `rules` / `version` 四个命令
- text / md / json 三种输出
- `--enable` / `--disable` / `--min-severity` / `--max` 规则过滤
- `--fail-on error|warning` 控制 CI 退出码
- `--output` 写入报告文件

**MCP server**

- `lint_document` / `lint_file` / `list_rules` 三个工具
- 手写 stdio JSON-RPC 2.0，不依赖官方 SDK

**工程化**

- 48 个自动化测试，Node 18 / 20 / 22 / 24 全绿
- GitHub Actions 多版本矩阵（Node 18 / 20 / 22 / 24），每次推送与 Release 时全量跑测试
- 中英双语文档

### 设计决定

- 零运行时依赖：无供应链风险，安装体积接近零
- 纯本地运行：文本不出机器，适合处理未发布或敏感内容
- 行号列号精确定位：所有发现带位置，可直接跳转
- 代码块与行内代码被屏蔽：规则不会在代码里误报

[0.1.0]: https://github.com/la2278647-arch/llmlint/releases/tag/v0.1.0
