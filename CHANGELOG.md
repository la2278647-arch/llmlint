# 更新日志

本项目遵循语义化版本与 Keep a Changelog。

## [0.2.0] - 2026-10-05

### 新增

**自动修复**

- `--fix` 原地修复可机械处理的规则，随后照常评分
- 库入口新增 `fixDocument` 与 `FIXABLE`，`./fix` 子路径同样可用
- `trailing-space` 现在识别 `CRLF` 行尾，行号列号定位统一按匹配起点计算

**示例**

- 新增 `examples/fix-target.md`，用于展示修复前后的评分对比

### 变更

- `--fix` 支持 `-` 作为标准输入，此时只输出修好的内容
- JSON 报告新增 `fixes` 字段，记录本次实际应用的修复
- 测试套件从 48 项扩到 68 项

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
