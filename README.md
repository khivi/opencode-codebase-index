# @khivi/opencode-codebase-index

[![npm version](https://img.shields.io/npm/v/@khivi/opencode-codebase-index.svg)](https://www.npmjs.com/package/@khivi/opencode-codebase-index)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Fork of [opencode-codebase-index](https://github.com/Helweg/opencode-codebase-index) — adds worktree support with shared indexing

Semantic codebase indexing and search. The upstream project already understands git branches — this fork extends it to understand **worktrees** (separate directories for parallel branch work) while keeping a single shared index in the main repo.

## Architecture

```
main-repo/
├── .opencode/index/           # single shared index
│   ├── codebase.db            # SQLite: chunks, embeddings, branch tags, call graph
│   ├── vectors.usearch        # vector index
│   ├── inverted-index.json    # BM25 keyword index
│   └── file-hashes.json       # incremental change tracking
├── .git/hooks/                # shared hooks (via --git-common-dir)
│   ├── post-commit
│   ├── post-merge
│   ├── post-rewrite
│   └── post-checkout
└── src/...

worktree-a/  (branch: feature-x)
└── src/...  # no .opencode/ — reads/writes the main repo's index

worktree-b/  (branch: feature-y)
└── src/...  # same shared index, different branch tag
```

**How it works:**
- Paths in the index are **relative** (`src/foo.ts`), so the same file across worktrees produces the same chunk ID
- Unchanged files share chunks across branches (deduped by content hash)
- Changed files get their own chunks, tagged with the branch name
- Queries filter by `currentBranch` — each worktree sees only its branch's chunks
- Hooks fire from any worktree and update the shared index via `--diff`
- Stale branches are pruned automatically during `index`

## Setup

### 1. Install

```bash
npm install -g @khivi/opencode-codebase-index
```

### 2. Configure an embedding provider

Create `~/.config/opencode/codebase-index.json` (global) or `.opencode/codebase-index.json` (per-repo):

**Local provider (recommended):**

Any OpenAI-compatible embeddings endpoint — Ollama, llama.cpp, vLLM, MLX, LiteLLM:

```json
{
  "embeddingProvider": "custom",
  "customProvider": {
    "baseUrl": "http://127.0.0.1:11434/v1",
    "model": "nomic-embed-text",
    "dimensions": 768
  }
}
```

```bash
brew install ollama && ollama pull nomic-embed-text
```

**Cloud providers:**

| Provider | Config | Env var |
|----------|--------|---------|
| OpenAI | `"openai"` | `OPENAI_API_KEY` |
| Google | `"google"` | `GOOGLE_API_KEY` |
| GitHub Copilot | `"github-copilot"` | Active subscription |
| Auto-detect | `"auto"` (default) | Tries all in order |

**Custom provider fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `baseUrl` | yes | Endpoint URL (must end with `/v1`) |
| `model` | yes | Model name |
| `dimensions` | yes | Vector dimensions |
| `apiKey` | no | Auth key |
| `maxTokens` | no | Max tokens per chunk (default: 8192) |
| `concurrency` | no | Parallel requests (default: 10) |

### 3. Build the index and install hooks (from main repo)

```bash
cd /path/to/main-repo
codebase-index install     # install git hooks
codebase-index index       # build initial index (incremental on subsequent runs)
```

Hooks are shared across all worktrees (installed via `--git-common-dir`). After this, indexing happens automatically on commit, merge, rebase, and branch switch.

### 4. Set up the MCP server

**Claude Code** — add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "codebase-index": {
      "command": "opencode-codebase-index-mcp",
      "args": ["--project", "."]
    }
  }
}
```

**Cursor** — add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "codebase-index": {
      "command": "npx",
      "args": ["opencode-codebase-index-mcp", "--project", "/path/to/project"]
    }
  }
}
```

The MCP server keeps the index hot in memory. Each worktree session starts its own MCP server pointing to its root — it reads the shared index but resolves file paths to the worktree.

**MCP tools:** `codebase_search`, `codebase_peek`, `find_similar`, `call_graph`, `index_codebase`, `index_status`, `index_health_check`, `index_metrics`, `index_logs`.

## CLI Commands

Run from the **main repo** (not a worktree):

```
codebase-index install [--force]   Install git hooks (--force overwrites existing)
codebase-index index [--force]     Index the codebase (--force rebuilds from scratch)
codebase-index serve [--restart]   Start MCP server (--restart kills existing first)
codebase-index status              Show index status
```

Hooks call `codebase-index index --diff <old> <new>` internally — this is the only command that runs from worktrees.

## .codebaseignore

Exclude tracked files from indexing (`.gitignore` syntax):

```
wiki/old/
src/generated/
tests/fixtures/large/
```

Place in the main repo root. Worktrees can have their own `.codebaseignore` too — rules stack.

## Configuration

`.opencode/codebase-index.json` (project) or `~/.config/opencode/codebase-index.json` (global):

```json
{
  "embeddingProvider": "auto",
  "customProvider": { ... },
  "indexing": {
    "maxFileSize": 1048576,
    "maxChunksPerFile": 100,
    "semanticOnly": false
  },
  "search": {
    "maxResults": 20,
    "minScore": 0.1,
    "hybridWeight": 0.5,
    "contextLines": 3
  }
}
```

## How it works

1. **Parsing** — tree-sitter (Rust) splits code into semantic chunks (functions, classes, interfaces)
2. **Embedding** — chunks vectorized via your provider, cached by content hash
3. **Storage** — usearch vectors (F16), SQLite metadata, BM25 inverted index
4. **Branch tagging** — chunks tagged per branch, unchanged files shared across branches
5. **Search** — hybrid semantic + keyword, RRF fusion, filtered by current branch
6. **Hooks** — `--diff` passes exact changed refs, only re-embeds modified files
7. **Pruning** — stale branches cleaned up automatically during index

## License

MIT — original work by [Kenneth Helweg](https://github.com/Helweg)
