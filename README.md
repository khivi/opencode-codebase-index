# @khivi/opencode-codebase-index

[![npm version](https://img.shields.io/npm/v/@khivi/opencode-codebase-index.svg)](https://www.npmjs.com/package/@khivi/opencode-codebase-index)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> Fork of [opencode-codebase-index](https://github.com/Helweg/opencode-codebase-index) — adds git-native CLI, worktree support, and shared indexing

Semantic codebase indexing and search. Works as an **MCP server** (Claude Code, Cursor, Windsurf) and a standalone **CLI** with git hooks for automatic incremental indexing.

## What this fork adds

- **Shared index across worktrees** — index lives in the main repo, all worktrees share it
- **Git hook integration** — automatic background reindexing via `--diff` (only changed files)
- **Worktree-scoped queries** — results filtered to the current worktree's files
- **`.codebaseignore`** — exclude files from indexing without untracking from git
- **Standalone CLI** — `codebase-index` runs without an MCP host

## Setup

### 1. Install

```bash
npm install -g @khivi/opencode-codebase-index
```

### 2. Configure an embedding provider

Create `~/.config/opencode/codebase-index.json` (global) or `.opencode/codebase-index.json` (per-repo):

**Custom / local provider (recommended for large codebases):**

Any OpenAI-compatible embeddings endpoint works. Examples: Ollama, llama.cpp, vLLM, MLX, LiteLLM.

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

With Ollama:
```bash
brew install ollama
ollama pull nomic-embed-text
```

With MLX (Apple Silicon):
```json
{
  "embeddingProvider": "custom",
  "customProvider": {
    "baseUrl": "http://127.0.0.1:11434/v1",
    "model": "mlx-community/nomicai-modernbert-embed-base-4bit",
    "dimensions": 768
  }
}
```

**Cloud providers:**

```json
{ "embeddingProvider": "openai" }
```

Set the corresponding environment variable:

| Provider | Config | Env var |
|----------|--------|---------|
| OpenAI | `"openai"` | `OPENAI_API_KEY` |
| Google | `"google"` | `GOOGLE_API_KEY` |
| GitHub Copilot | `"github-copilot"` | Active subscription |
| Auto-detect | `"auto"` (default) | Tries all in order |

**Custom provider options:**

| Field | Required | Description |
|-------|----------|-------------|
| `baseUrl` | yes | OpenAI-compatible endpoint (must end with `/v1`) |
| `model` | yes | Model name sent in API request |
| `dimensions` | yes | Vector dimensions the model produces |
| `apiKey` | no | API key (if endpoint requires auth) |
| `maxTokens` | no | Max tokens per chunk (default: 8192) |
| `concurrency` | no | Parallel requests (default: 10) |
| `requestIntervalMs` | no | Rate limit interval in ms |

### 3. Set up the MCP server (Claude Code / Cursor)

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

The MCP server keeps the index hot in memory — no reload cost between queries.

**MCP tools exposed:** `codebase_search`, `codebase_peek`, `find_similar`, `call_graph`, `index_codebase`, `index_status`, `index_health_check`, `index_metrics`, `index_logs`.

### 4. Install git hooks (per repo)

```bash
codebase-index install          # install hooks
codebase-index install --force  # overwrite existing hooks
```

Installs hooks in `.git/hooks/` (worktree-aware via `--git-common-dir`):

| Hook | Trigger | Diff refs |
|------|---------|-----------|
| `post-commit` | After commit | `HEAD~1 HEAD` |
| `post-merge` | After merge/pull | `ORIG_HEAD HEAD` |
| `post-rewrite` | After rebase | `ORIG_HEAD HEAD` |
| `post-checkout` | Branch switch | `$old $new` |

All hooks run `codebase-index index --diff <old> <new>` in the background — only re-indexes the changed files.

### 5. Build the initial index

```bash
codebase-index index --force    # first-time full index
```

After that, hooks keep it updated automatically.

## CLI Commands

```
codebase-index install [--force]      Install git hooks (--force overwrites)
codebase-index index [options]        Index the codebase (incremental by default)
codebase-index status [--files]       Show index status (--files lists indexed files)
```

Search is done via the MCP server (Claude Code, Cursor) — no CLI query command needed.

**Index options:**
- `--force` — full reindex (ignore caches)
- `--diff <old> <new>` — only index files changed between two refs (used by hooks)

**Status in worktrees:**
- Shows worktree/main repo paths
- `--files` lists only files changed from base branch (not all 8000+ files)

## Worktree support

The index is stored in the **main repo's** `.opencode/index/` and shared across all worktrees:

```
main-repo/.opencode/index/     # shared index (vectors, SQLite, keywords)
├── codebase.db
├── vectors.usearch
├── inverted-index.json
└── file-hashes.json

worktree-a/                    # no .opencode/ here — uses main repo's
worktree-b/                    # same — shared index
```

- **Indexing** from any worktree writes to the shared index
- **Querying** scopes results to the worktree's `git ls-files`
- **Hooks** pass `--diff` with exact changed refs — fast, no full scan
- **MCP server** also uses the shared index (via `createIndexer`)

## .codebaseignore

Create `.codebaseignore` in the repo root (same syntax as `.gitignore`) to exclude tracked files from indexing:

```
# Exclude generated code
src/generated/
*.gen.ts

# Exclude archived docs
wiki/old/

# Exclude test fixtures
tests/fixtures/large/
```

Both main repo and worktree `.codebaseignore` files are loaded (rules stack).

## Configuration reference

`.opencode/codebase-index.json` (project) or `~/.config/opencode/codebase-index.json` (global):

```json
{
  "embeddingProvider": "auto",
  "embeddingModel": "text-embedding-3-small",
  "customProvider": { ... },
  "scope": "project",
  "indexing": {
    "autoIndex": false,
    "watchFiles": true,
    "maxFileSize": 1048576,
    "maxChunksPerFile": 100,
    "semanticOnly": false,
    "retries": 3,
    "retryDelayMs": 1000
  },
  "search": {
    "maxResults": 20,
    "minScore": 0.1,
    "hybridWeight": 0.5,
    "fusionStrategy": "rrf",
    "contextLines": 3,
    "includeContext": true
  }
}
```

## How it works

1. **Parsing** — tree-sitter (Rust native) splits code into semantic chunks (functions, classes, interfaces)
2. **Embedding** — chunks are vectorized via your configured provider
3. **Storage** — vectors in usearch (F16), metadata in SQLite, keywords in BM25 inverted index
4. **Search** — hybrid semantic + keyword retrieval, RRF fusion, deterministic reranking
5. **Incremental** — blob SHAs track changes, only re-embeds what changed
6. **Branch-aware** — embedding reuse across branches, call graph extraction

## License

MIT — original work by [Kenneth Helweg](https://github.com/Helweg)
