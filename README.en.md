# llmlint

**Health checks for text written by AI.** 24 rules, a 0-100 score, CLI plus MCP server. Zero dependencies, runs entirely on your machine.

- Docs: [中文](README.md) · [English](README.en.md)
- License: MIT
- Runtime dependencies: 0

---

## Why

AI writes. It does not always write correctly. The problems it leaves behind:

- **Placeholder leftovers**: `TODO`, `待补充` still in the deliverable
- **Empty filler**: `综上所述`, `值得一提的是` — zero information density
- **Unverifiable claims**: `总是有效`, `100% 安全`, `提升了 45%` with no source
- **Fuzzy time**: `上周`, `最近` — which week, exactly?
- **Broken formatting**: heading level jumps, misaligned tables, code blocks without a language, trailing whitespace
- **Tone drift**: a mountain of hedges, or a run of ALL CAPS

None of these are syntax errors. No Markdown parser will complain. They are direct hits on credibility.

llmlint closes that gap.

## Features

- **24 rules** in Chinese and English, aimed at real LLM failure modes
- **0-100 score with A-F grades**, weighted by severity
- **Precise locations**: every finding has line, column, and a source snippet
- **Code is masked automatically**: rules never fire inside code blocks
- **CLI** with four commands and text / md / json output
- **CI-friendly exit codes**: 2 on error
- **MCP server** with three tools, hand-written stdio JSON-RPC, no SDK
- **Zero dependencies, fully local**: your text never leaves the machine

## Install

```bash
npm install llmlint
```

Or run without installing:

```bash
npx llmlint --help
```

Requires Node.js 18 or newer.

## Quick start

```bash
llmlint check README.md
```

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

Score only (great for PR headers):

```bash
llmlint score README.md
# README.md  90/100  A  5 findings
```

Full rule list:

```bash
llmlint rules
```

## The 24 rules

| Rule | Severity | What it catches |
| --- | --- | --- |
| `placeholder-text` | error | Leftover `TODO`, `FIXME`, `待补充`, `{{var}}` |
| `empty-list-item` | error | Empty list items |
| `unbalanced-markdown` | error | Unclosed `**` emphasis |
| `filler-words` | warning | More than 5 filler phrases |
| `overclaim` | warning | Unfalsifiable claims |
| `marketing-superlative` | warning | Marketing superlatives |
| `vague-time` | warning | Fuzzy relative time |
| `repetition` | warning | Duplicated long sentences |
| `heading-jump` | warning | Heading level jumps (H1 to H3) |
| `repeated-heading` | warning | Duplicate heading text |
| `list-depth` | warning | Nested lists deeper than 6 levels |
| `shout-caps` | warning | Runs of ALL CAPS |
| `table-misaligned` | warning | Tables with inconsistent column counts |
| `hedge-words` | info | More than 8 hedging words |
| `emoji-sprawl` | info | More than 8 emoji |
| `bare-url` | info | Bare URLs not wrapped as links |
| `mixed-punct` | info | Chinese punctuation in English prose |
| `cjk-spacing` | info | Missing space between Chinese and Latin |
| `code-lang` | info | Code blocks without a language tag |
| `sentence-too-long` | info | Sentences over 160 characters |
| `paragraph-bloat` | info | Paragraphs over 1200 characters |
| `trailing-space` | info | Trailing whitespace |
| `number-without-source` | info | Percentage claims without a source |
| `no-final-newline` | info | Missing newline at end of file |

## Scoring

Starts at 100, deducts per finding:

| Severity | Deduction |
| --- | --- |
| error | 10 |
| warning | 5 |
| info | 2 |

Floor is 0. Grades: A >= 90, B >= 80, C >= 70, D >= 60, F < 60.

## Filtering

```bash
# warnings and above only
llmlint check README.md --min-severity warning

# only these rules
llmlint check README.md --enable placeholder-text,overclaim

# skip some rules
llmlint check README.md --disable trailing-space,cjk-spacing

# cap the findings
llmlint check README.md --max 20

# fail CI on warnings
llmlint check README.md --fail-on warning

# machine-readable or Markdown report
llmlint check README.md --format json
llmlint check README.md --format md --output report.md
```

## As a library

```js
import { checkDocument } from 'llmlint';

const result = checkDocument(text, { minSeverity: 'warning' });
console.log(result.score);      // { score: 85, grade: 'B', counts: {...} }
console.log(result.findings);   // [{ rule, severity, message, line, column, snippet }]
```

## MCP server

For Claude Code, Cursor, and other MCP clients. Hand-written stdio JSON-RPC 2.0, no official SDK:

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

| Tool | Purpose |
| --- | --- |
| `lint_document` | Lint a text string, return score and findings |
| `lint_file` | Lint a local file |
| `list_rules` | List all rules and severities |

## CI

`.github/workflows/ci.yml` ships with the project. Minimal step:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '22.x' }
- run: node src/cli.js check 'docs/**/*.md' --fail-on warning
```

Exit codes: 0 = clean, 1 = hit the `--fail-on` threshold, 2 = error present.

## Docker

```bash
docker build -t llmlint .
docker run --rm -v "$PWD:/w" -w /w llmlint check README.md
```

Image is based on `node:22-alpine`; there is no `npm install` step because there are no dependencies.

## Design principles

1. **Zero dependencies.** No MCP SDK, no lint rule packs. Install size is near zero, supply-chain attack surface is zero.
2. **Your text stays on your machine.** Pure local string processing, no network calls, no telemetry.
3. **False positives cost more than false negatives.** Code blocks, inline code, link syntax, and common acronyms are all masked or allow-listed.
4. **Findings must be locatable.** Every finding carries a line, column, and snippet.
5. **Rules are pluggable.** Adding a rule is one registration in `src/rules.js` plus one positive test case.

## Project layout

```text
src/
  engine.js      line/column math, code masking, regex constants, rule registry
  rules.js       the 24 rule implementations
  score.js       scoring and grading
  index.js       checkDocument() entry point
  cli.js         command line interface
  mcp/server.js  MCP server

test/
  rules.test.js  rule and scoring tests (39)
  mcp.test.js    MCP protocol tests (9)

examples/
  demo-good.md   clean document, zero findings
  demo-bad.md    all 24 rules fire
```

## Roadmap

- [ ] `--fix` autofix for trailing whitespace, CJK spacing, final newline
- [ ] `.llmlintrc` config file for custom rule sets
- [ ] Incremental checking of changed lines only
- [ ] More languages (Japanese, Korean, French)
- [ ] Plugin API for user rules
- [ ] GitHub Actions scorecard output format

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — use it freely, own the consequences.
