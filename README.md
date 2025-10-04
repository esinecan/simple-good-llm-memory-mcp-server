## Quick Start

### 1. Start Services

```bash
docker-compose up -d
```

This starts:
- **ChromaDB** (port 8000) - Vector storage for semantic search
- **Neo4j** (ports 7474, 7687) - Knowledge graph for relationships

### 2. Configure in llm client

Type `/mcp` in llm client and add:

```json
{
  "mcpServers": {
    "skynet-memory": {
      "command": "node",
      "args": ["/Users/PROECT_DIRECTORY/dist/index.js"],
      "env": {
        "CHROMA_URL": "http://localhost:8000",
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "password123"
      }
    }
  }
}
```

### 3. Restart llm client

Changes take effect after restart.

## Features

### Dual Storage Architecture
- **ChromaDB**: Vector embeddings for semantic search
- **Neo4j**: Graph relationships between memories, tags, sessions

### Hybrid Search
- Semantic search via embeddings (Google text-embedding-004)
- Keyword fallback when semantic results are poor
- Intelligent merging and ranking

### Memory Operations
- **Save**: Store with tags, importance (1-10), context, session
- **Search**: Semantic + keyword hybrid with filters
- **Update**: Modify existing memories
- **Delete**: Remove with automatic graph cleanup
- **Related**: Find semantically similar memories
- **Stats**: Analytics and tag distribution
- **Time Range**: Temporal queries with pagination

### Resilience
- Automatic retry queues for failed syncs
- Health checks and graceful degradation
- Falls back to hash-based embeddings if API unavailable

## Architecture

```
┌─────────────────────────────────────────┐
│         MCP Server (index.js)           │
│  - 8 Tools exposed via MCP protocol     │
└────────────┬────────────────────────────┘
             │
┌────────────┴────────────────────────────┐
│   Conscious Memory Service              │
│  - Hybrid search logic                  │
│  - Importance scoring                   │
│  - Session management                   │
└────────┬─────────────┬──────────────────┘
         │             │
         ▼             ▼
┌─────────────┐  ┌──────────────────┐
│  ChromaDB   │  │  Neo4j KG        │
│  Vectors    │  │  Relationships   │
└─────────────┘  └──────────────────┘
```

## 8 MCP Tools

1. **save_memory** - Store information
2. **search_memories** - Search with filters
3. **search_memories_by_time_range** - Temporal queries
4. **update_memory** - Modify memories
5. **delete_memory** - Remove memories
6. **get_memory_tags** - List all tags
7. **get_related_memories** - Find similar
8. **get_memory_stats** - Analytics

## Environment Variables

```env
# ChromaDB
CHROMA_URL=http://localhost:8000
MEMORY_COLLECTION_NAME=skynet_memories

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123

# Google Embeddings (optional)
GOOGLE_API_KEY=your_key_here
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Type check
npm run type-check
```
## License

MIT
