# @khivi/opencode-codebase-index

[![npm version](https://img.shields.io/npm/v/@khivi/opencode-codebase-index.svg)](https://www.npmjs.com/package/@khivi/opencode-codebase-index)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

> Fork of [opencode-codebase-index](https://github.com/Helweg/opencode-codebase-index) by Kenneth Helweg

Semantic codebase indexing and search — with a standalone **git-native CLI** for incremental indexing via git hooks and worktree-aware querying.

## What this fork adds

- **Standalone CLI** (`codebase-index`) — runs without an MCP host
- **Git hook integration** — automatic background reindexing on commit, merge, checkout, and rewrite
- **Blob SHA incremental indexing** — diffs via `git hash-object` instead of reading files, skips unchanged files instantly
- **Worktree-aware scoping** — `git ls-files` scopes queries to the current worktree checkout

The upstream MCP server, OpenCode plugin, and all original features are preserved.

## Quick Start

### Install

```bash
npm install @khivi/opencode-codebase-index
```

### Set up an embedding provider

You need one embedding provider. The easiest local option:

```bash
brew install ollama            # install Ollama
ollama pull nomic-embed-text   # pull the embedding model (~274MB)
```

Or use a cloud provider:

```bash
export OPENAI_API_KEY=sk-...   # OpenAI
# or
export GOOGLE_API_KEY=...      # Google
# or have an active GitHub Copilot subscription
```

The package auto-detects whichever is available.

### Set up git hooks (one-time, per repo)

```bash
codebase-index install
```

This installs hooks in `.git/hooks/` (worktree-aware via `--git-common-dir`):
- `post-commit` — reindex after commits
- `post-merge` — reindex after merges (symlink to post-commit)
- `post-rewrite` — reindex after rebases (symlink to post-commit)
- `post-checkout` — reindex on branch switch (with `[ "$3" = "1" ]` guard)

All hooks run `codebase-index incremental` in the background (`&`).

### Full index

```bash
codebase-index index
```

### Incremental update (what the hooks run)

```bash
codebase-index incremental
```

Compares blob SHAs of tracked files against stored hashes. Only triggers the indexer when files actually changed.

### Query

```bash
codebase-index query "authentication middleware" --limit 5
```

Results are scoped to the current worktree's `git ls-files`:

```
src/auth/validator.ts:45  validateToken  0.923
src/middleware/auth.ts:12  authMiddleware  0.891
src/api/login.ts:89  handleLogin  0.847
```

### Status

```bash
codebase-index status
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `codebase-index install` | Install git hooks for automatic incremental indexing |
| `codebase-index index` | Full reindex of the codebase |
| `codebase-index incremental` | Incremental update — only changed files (blob SHA diff) |
| `codebase-index query <text>` | Worktree-scoped semantic search |
| `codebase-index status` | Show index status |

## MCP Server (Cursor, Claude Code, Windsurf)

The MCP server from upstream is fully preserved:

```bash
npm install @khivi/opencode-codebase-index @modelcontextprotocol/sdk zod
```

**Cursor** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "codebase-index": {
      "command": "npx",
      "args": ["opencode-codebase-index-mcp", "--project", "/path/to/your/project"]
    }
  }
}
```

Exposes 9 tools: `codebase_search`, `codebase_peek`, `find_similar`, `call_graph`, `index_codebase`, `index_status`, `index_health_check`, `index_metrics`, `index_logs`.

## Configuration

Zero-config by default. Customize in `.opencode/codebase-index.json`:

```json
{
  "embeddingProvider": "auto",
  "scope": "project",
  "indexing": {
    "autoIndex": false,
    "watchFiles": true,
    "maxFileSize": 1048576,
    "maxChunksPerFile": 100,
    "semanticOnly": false
  },
  "search": {
    "maxResults": 20,
    "minScore": 0.1,
    "hybridWeight": 0.5,
    "fusionStrategy": "rrf"
  }
}
```

### Embedding Providers

Auto-detected in order: GitHub Copilot, OpenAI, Google, Ollama. Or set explicitly:

| Provider | Setup | Best For |
|----------|-------|----------|
| **GitHub Copilot** | Have active subscription | Small codebases (<1k files) |
| **OpenAI** | `export OPENAI_API_KEY=sk-...` | General use |
| **Google** | `export GOOGLE_API_KEY=...` | Medium-large codebases |
| **Ollama** | `ollama pull nomic-embed-text` | Large codebases, privacy |
| **Custom** | OpenAI-compatible endpoint | Self-hosted |

## How It Works

1. **Parsing** — tree-sitter (Rust native) splits code into semantic chunks (functions, classes, interfaces)
2. **Embedding** — chunks are vectorized via your configured AI provider
3. **Storage** — vectors in usearch (F16 quantization), metadata in SQLite, keywords in BM25 inverted index
4. **Search** — hybrid semantic + keyword retrieval, RRF fusion, deterministic reranking
5. **Incremental** — blob SHAs track changes, only re-embeds what changed

### Storage Structure

```
.opencode/index/
├── codebase.db           # SQLite: embeddings, chunks, branch catalog, symbols, call edges
├── vectors.usearch       # Vector index (uSearch)
├── inverted-index.json   # BM25 keyword index
└── file-hashes.json      # Blob SHA change detection
```

## Upstream Features

All upstream capabilities are preserved:

- Branch-aware indexing with embedding reuse across branches
- Call graph extraction (TypeScript, JavaScript, Python, Go, Rust)
- Hybrid search (semantic + BM25 keyword)
- OpenCode plugin with slash commands (`/search`, `/find`, `/index`, `/status`)
- Native Rust module (tree-sitter, usearch, SQLite, xxhash)
- Platform support: macOS (x86_64, ARM64), Linux (x86_64, ARM64), Windows (x86_64)

For full upstream documentation, see the [original repository](https://github.com/Helweg/opencode-codebase-index).

## License

MIT — original work by [Kenneth Helweg](https://github.com/Helweg)
