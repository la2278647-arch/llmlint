# llmlint [![release](https://img.shields.io/github/v/release/la2278647-arch/llmlint)](https://github.com/la2278647-arch/llmlint/releases) [![license](https://img.shields.io/github/license/la2278647-arch/llmlint)](LICENSE) [![node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/) [![deps](https://img.shields.io/badge/runtime%20deps-0-orange)](https://github.com/la2278647-arch/llmlint)

**Health checks for text written by AI.** 26 rules, a 0-100 score, CLI plus MCP server. Zero dependencies, runs entirely on your machine.

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

- **26 rules** in Chinese and English, aimed at real LLM failure modes
- **0-100 score with A-F grades**, weighted by severity
- **Precise locations**: every finding has line, column, and a source snippet
- **Code is masked automatically**: rules never fire inside code blocks
- **CLI** with four commands and text / md / json output
- **CI-friendly exit codes**: 2 on error
- **MCP server** with five tools including auto-fix, hand-written stdio JSON-RPC, no SDK
- **Zero dependencies, fully local**: your text never leaves the machine


## Performance

All 26 rules are pure string and regex work. There is no Markdown parser and no runtime dependency.

Measured on one machine with Node v24 (`npm run bench`, median of 200 rounds):

``` text
target          kB   median(ms)   docs/sec
demo-bad.md      0.6       0.088    11429
README.md        9.3       2.372      422
synthetic-64k   65.3      17.448       57
```

Roughly 0.27 ms per KB on large documents, growing linearly with size; the cost is dominated by the regex passes, not parsing. Add `--json` for machine-readable output.

Numbers depend on the machine and Node version, so only same-machine comparisons are meaningful. The benchmark ships with the repository.
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
规则    26/26

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

## The 26 rules

| Rule | Severity | What it catches |
| --- | --- | --- |
| `placeholder-text` | error | Leftover `TODO`, `FIXME`, `待补充`, `{{var}}` |
| `empty-list-item` | error | Empty list items |
| `unbalanced-markdown` | error | Unclosed `**`, `~~`, inline code, fences, link brackets |
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
| `ja-halfwidth-punct` | info | Half-width `,` `.` `!` `?` in Japanese prose |
| `ja-hankaku-kana` | info | Mixed half-width and full-width katakana |

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

## Auto-fix

Three rules are pure mechanical rewrites. `--fix` edits the source file in place, then scores it as usual:

```bash
llmlint check README.md --fix
cat README.md | llmlint check --fix -

# report what would change, write nothing
llmlint check README.md --fix --dry-run
```

| Rule | What it does |
| --- | --- |
| `trailing-space` | strips trailing spaces and tabs |
| `cjk-spacing` | inserts a space between CJK and letters or digits |
| `no-final-newline` | appends a newline at the end of the file |

Fenced blocks and inline code are never touched. `CRLF` line endings are preserved. Running it twice changes nothing. Rules that cannot be fixed mechanically are still reported, and the exit code still follows `--fail-on`.

## Project config

A rule set belongs in version control, not on a command line. Drop an `llmlint.json` or `.llmlintrc.json` at the repository root; it is discovered by walking up from the current directory, and the first match wins:

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

Keys are `min-severity`, `max-findings`, `fail-on`, `enable`, `disable` and `severity`. The `severity` map retunes a rule, and both the penalty and the `--min-severity` threshold follow it:

```json
{ "severity": { "sentence-too-long": "error" } }
```

The `rules` array merges in declaration order: later scalars win, and `enable` plus `disable` are unions. A `path` array is an OR, and a block with no `path` applies to every file. `**` matches zero or more path segments; `*` and `?` never cross a slash.

Precedence is command line over config file over defaults. Passing `--enable` on the command line counts as an allow-list, so a `--disable` from the config no longer applies.

Bad config fails fast, with the line, column and reason:

```bash
llmlint check README.md
# llmlint.json: not valid JSON (line 3 column 2): Unexpected token ...

llmlint config README.md      # show what is actually in effect
llmlint check --config l.json # explicit config file
llmlint check --no-config f.md # skip discovery
```


### Japanese documents

Japanese projects usually want `cjk-spacing` off. In Japanese there is no space between kana and Latin characters. The two Japanese rules need no opt-in; they gate themselves on kana:

``` json
{
  "rules": [
    { "path": ["**/*.md"], "disable": ["cjk-spacing"] }
  ]
}
```

`cjk-spacing` fires only when a CJK ideograph sits next to Latin. Kana next to Latin is fine. `ja-halfwidth-punct` only runs on lines containing kana.

A repo mixing Chinese, English, and Japanese needs no config at all.

`examples/demo-ja.md` is a Japanese document with zero findings. Use it to confirm the rules are not false-positiving.

## Incremental checking

Only "what did this change introduce?" matters in a pull request. `diff` runs the full check, then splits findings by git's changed line ranges: new findings deduct and drive the exit code, pre-existing ones are only counted.

```bash
llmlint diff                       # changed and new untracked files
llmlint diff docs/a.md             # a specific file
llmlint diff --base origin/main    # explicit base ref
```

```json
{
  "file": "docs/a.md",
  "base": "HEAD",
  "newFile": false,
  "score": { "score": 98, "grade": "A", "penalty": 2 },
  "added": [{ "rule": "trailing-space", "line": 5 }],
  "existing": [{ "rule": "cjk-spacing", "line": 3 }]
}
```

Changed ranges come from `git diff --unified=0` hunk headers. Hunks that only delete lines produce no range, and a new file counts entirely as new. Untracked files that are not ignored are checked too; anything matched by `.gitignore` is skipped.

`diff` reuses the config file and the command line flags, so path-scoped rule sets, `severity` overrides and `--fail-on` all apply as usual. `--fix` is not supported: fixing rewrites historical lines, which breaks the new-versus-existing split.

## As a library

```js
import { checkDocument, fixDocument } from 'llmlint';

const result = checkDocument(text, { minSeverity: 'warning' });
console.log(result.score);      // { score: 85, grade: 'B', counts: {...} }
console.log(result.findings);   // [{ rule, severity, message, line, column, snippet }]

const fixed = fixDocument(text);   // only the three mechanical rules
console.log(fixed.fixes);          // [{ rule: 'cjk-spacing', count: 4 }]
console.log(fixed.text);
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
| `fix_document` | Auto-fix a text string and return the fixed text |
| `fix_file` | Auto-fix a local file and return the fixed text, without writing it back |

`fix_document` returns four things at once: what was changed, the score before and after, what remains, and which rules are fixable at all:

``` json
{
  "changed": true,
  "text": "A paragraph with Chinese English mixed.\n",
  "changes": [{"rule": "cjk-spacing", "count": 2}],
  "scoreBefore": {"score": 94, "grade": "A"},
  "scoreAfter": {"score": 100, "grade": "A"},
  "remaining": [],
  "fixable": ["trailing-space", "cjk-spacing", "no-final-newline"]
}
```

Score objects also carry `counts` (findings per severity) and `penalty` (total deduction).

Only trailing whitespace, CJK spacing, and the final newline can be fixed mechanically. Everything else needs judgement, so it stays in `remaining`.

## CI

The full workflow lives in `examples/github-actions.yml`; copy it to `.github/workflows/` to enable CI. Minimal step:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with: { node-version: '22.x' }
- run: node src/cli.js check 'docs/**/*.md' --fail-on warning
```

Exit codes: 0 = clean, 1 = hit the `--fail-on` threshold, 2 = error present.

A pull-request gate usually wants incremental checking, so that only newly introduced problems block the merge:

```yaml
- run: node src/cli.js diff --base origin/main --fail-on warning
```

## Design principles

1. **Zero dependencies.** No MCP SDK, no lint rule packs. Install size is near zero, supply-chain attack surface is zero.
2. **Your text stays on your machine.** Pure local string processing, no network calls, no telemetry.
3. **False positives cost more than false negatives.** Code blocks, inline code, link syntax, and common acronyms are all masked or allow-listed.
4. **Findings must be locatable.** Every finding carries a line, column, and snippet.
5. **Rules are pluggable.** Adding a rule is one registration in `src/rules.js` plus one positive test case.
6. **Language rules gate first.** The two Japanese rules only run on lines containing kana, so mixed Chinese / English / Japanese documents do not trip them. Code blocks, inline code, and URLs are masked before any rule runs.

Trade-offs in the Japanese rules:

- `ja-halfwidth-punct` skips decimals and thousands separators (digits on both sides) and ellipses. It reports at most one finding per file, so a Japanese document does not flood the output.
- `ja-hankaku-kana` fires only when half-width and full-width katakana appear together. A document that uses half-width katakana throughout is not flagged; that is a common style in technical writing.

## Project layout

```text
src/
  engine.js      line/column math, code masking, regex constants, rule registry
  rules.js       the 26 rule implementations
  score.js       scoring and grading
  fix.js         the three mechanically fixable rules
  config.js      config discovery, glob scoping and option merge
  diff.js        changed-range parsing and new-versus-existing split
  index.js       checkDocument() entry point
  cli.js         command line interface
  mcp/server.js  MCP server

test/
  rules.test.js      rules and scoring (63)
  cli-format.test.js output formats and error paths (9)
  fix.test.js        autofix (26)
  config.test.js     config and precedence (43)
  diff.test.js       incremental checking (27)
  mcp.test.js        protocol (23)

examples/
  demo-good.md   clean document, zero findings
  demo-ja.md     clean Japanese document, zero findings
  demo-bad.md    14 rules, 25 findings
  fix-target.md  before and after autofix
```

## Roadmap

- [x] `--fix` autofix for trailing whitespace, CJK spacing, final newline
- [x] Project config files (`llmlint.json` / `.llmlintrc.json`)
- [x] Incremental checking (`diff`): only newly introduced problems
- [ ] More languages (Japanese, Korean, French)
- [ ] A guide to tuning thresholds
- [ ] Container support: must be built and verified in CI before shipping
- [ ] A GitHub Pages example site

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) — use it freely, own the consequences.
