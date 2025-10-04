#!/usr/bin/env node

/**
 * Conscious Memory MCP Server
 * Exposes conscious memory operations as tools for the LLM
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getConsciousMemoryService } from './lib/conscious-memory.js';
import knowledgeGraphServiceInstance from './lib/knowledge-graph-service.js';

async function main() {
  console.log(' Starting Conscious Memory MCP Server...');

  // Create MCP server
  const server = new McpServer({
    name: "conscious-memory",
    version: "1.0.0"
  }, {
    capabilities: {
      tools: {}
    }
  });
  // Initialize conscious memory service
  const memoryService = getConsciousMemoryService();
  await memoryService.initialize();

  // === MEMORY SAVE TOOL ===
  server.tool("save_memory", 
    {
      content: z.string().describe("The information to remember"),
      tags: z.array(z.string()).optional().describe("Tags to categorize this memory"),
      importance: z.number().min(0).max(10).optional().describe("Importance level: preferably 1-10 (where 1=low importance, 10=critical importance), but 0-1 decimal values will be auto-converted. Default is 5."),
      context: z.string().optional().describe("Additional context about when/why this was saved"),
      sessionId: z.string().optional().describe("Session ID to associate with this memory")
    },
    async ({ content, tags, importance, context, sessionId }) => {
      try {
        // Safe conversion: if importance is between 0-1, convert to 1-10 scale
        let safeImportance = importance || 5;
        if (safeImportance > 0 && safeImportance < 1) {
          safeImportance = Math.max(1, Math.floor(10 * safeImportance));
          console.log(` Converted importance from ${importance} to ${safeImportance}`);
        }
        
        const id = await memoryService.saveMemory({
          content,
          tags: tags || [],
          importance: safeImportance,
          source: 'explicit',
          context,
          sessionId
        });        const result = {
          success: true,
          id,
          message: `Memory saved successfully with ID: ${id}`,
          summary: {
            content: content.slice(0, 100) + (content.length > 100 ? '...' : ''),
            tags: tags || [],
            importance: safeImportance
          }
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to save memory:', error);
        const errorResult = {
          success: false,
          error: 'Failed to save memory to conscious storage',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text", 
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === MEMORY SEARCH TOOL ===
  server.tool("search_memories",
    {
      query: z.string().describe("What to search for in conscious memories"),
      tags: z.array(z.string()).optional().describe("Filter by specific tags"),
      importance_min: z.number().min(1).max(10).optional().describe("Minimum importance level"),
      importance_max: z.number().min(1).max(10).optional().describe("Maximum importance level"),
      limit: z.number().min(1).max(50).optional().describe("Maximum number of results per page (default: 10)"),
      page: z.number().min(1).optional().describe("Page number (1-based, default: 1)"),
      minScore: z.number().min(0).max(1).optional().describe("Minimum similarity score (default: 0.15)"),
      sessionId: z.string().optional().describe("Filter by session ID")
    },
    async ({ query, tags, importance_min, importance_max, limit, page, minScore, sessionId }) => {
      try {
        const pageSize = limit || 10;
        const currentPage = page || 1;
        const offset = (currentPage - 1) * pageSize;

        // Get more results than needed for pagination
        const allResults = await memoryService.searchMemories(query, {
          tags,
          importanceMin: importance_min,
          importanceMax: importance_max,
          limit: offset + pageSize * 2, // Fetch extra for pagination info
          minScore: minScore || 0.15,
          sessionId
        });

        // Apply pagination
        const paginatedResults = allResults.slice(offset, offset + pageSize);
        const totalResults = allResults.length;
        const totalPages = Math.ceil(totalResults / pageSize);

        const result = {
          success: true,
          query,
          found: paginatedResults.length,
          totalResults,
          pagination: {
            page: currentPage,
            pageSize,
            totalPages,
            hasNext: currentPage < totalPages,
            hasPrevious: currentPage > 1
          },
          memories: paginatedResults.map(result => ({
            id: result.id,
            content: result.text,
            tags: result.tags,
            importance: result.importance,
            score: Math.round(result.score * 100) / 100,
            context: result.context,
            source: result.source
          }))
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to search memories:', error);
        const errorResult = {
          success: false,
          error: 'Failed to search conscious memories',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === UPDATE MEMORY TOOL ===
  server.tool("update_memory",
    {
      id: z.string().describe("ID of the memory to update"),
      content: z.string().optional().describe("New content for the memory"),
      tags: z.array(z.string()).optional().describe("New tags for the memory"),
      importance: z.number().min(1).max(10).optional().describe("New importance level"),
      context: z.string().optional().describe("New context for the memory")
    },
    async ({ id, content, tags, importance, context }) => {
      try {
        const success = await memoryService.updateMemory({
          id,
          content,
          tags,
          importance,
          context
        });

        const result = success 
          ? {
              success: true,
              id,
              message: `Memory ${id} updated successfully`,
              updates: { content, tags, importance, context }
            }
          : {
              success: false,
              error: `Memory ${id} not found or could not be updated`
            };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !success
        };
      } catch (error) {
        console.error('Failed to update memory:', error);
        const errorResult = {
          success: false,
          error: 'Failed to update conscious memory',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === DELETE MEMORY TOOL ===
  server.tool("delete_memory",
    {
      id: z.string().describe("ID of the memory to delete")
    },
    async ({ id }) => {
      try {
        const success = await memoryService.deleteMemory(id);

        const result = success
          ? {
              success: true,
              id,
              message: `Memory ${id} deleted successfully`
            }
          : {
              success: false,
              error: `Memory ${id} not found or could not be deleted`
            };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ],
          isError: !success
        };
      } catch (error) {
        console.error('Failed to delete memory:', error);
        const errorResult = {
          success: false,
          error: 'Failed to delete conscious memory',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === GET MEMORY TAGS TOOL ===
  server.tool("get_memory_tags",
    {},
    async () => {
      try {
        const tags = await memoryService.getAllTags();

        const result = {
          success: true,
          tags,
          count: tags.length
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to get memory tags:', error);
        const errorResult = {
          success: false,
          error: 'Failed to retrieve memory tags',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === GET RELATED MEMORIES TOOL ===
  server.tool("get_related_memories",
    {
      id: z.string().describe("ID of the memory to find relations for"),
      limit: z.number().min(1).max(20).optional().describe("Maximum number of related memories (default: 5)")
    },
    async ({ id, limit }) => {
      try {
        const relatedMemories = await memoryService.getRelatedMemories(id, limit || 5);

        const result = {
          success: true,
          sourceId: id,
          found: relatedMemories.length,
          relatedMemories: relatedMemories.map(result => ({
            id: result.id,
            content: result.text,
            tags: result.tags,
            importance: result.importance,
            score: Math.round(result.score * 100) / 100,
            source: result.source
          }))
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to get related memories:', error);
        const errorResult = {
          success: false,
          error: 'Failed to find related memories',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === MEMORY STATS TOOL ===
  server.tool("get_memory_stats",
    {},
    async () => {
      try {
        const stats = await memoryService.getStats();

        const result = {
          success: true,
          stats: {
            totalMemories: stats.totalConsciousMemories,
            uniqueTags: stats.tagCount,
            averageImportance: Math.round(stats.averageImportance * 100) / 100,
            sourceBreakdown: stats.sourceBreakdown
          }
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to get memory stats:', error);
        const errorResult = {
          success: false,
          error: 'Failed to retrieve memory statistics',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === SEARCH MEMORIES BY TIME RANGE TOOL ===
  server.tool("search_memories_by_time_range",
    {
      query: z.string().optional().describe("Search query (optional - if empty, returns all memories in time range)"),
      startDate: z.string().optional().describe("Start date for time range filter (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"),
      endDate: z.string().optional().describe("End date for time range filter (ISO 8601 format, e.g., '2024-12-31T23:59:59Z')"),
      tags: z.array(z.string()).optional().describe("Filter by specific tags"),
      importance_min: z.number().min(1).max(10).optional().describe("Minimum importance level"),
      importance_max: z.number().min(1).max(10).optional().describe("Maximum importance level"),
      pageSize: z.number().min(1).max(50).optional().describe("Number of results per page (default: 10, max: 50)"),
      page: z.number().min(1).optional().describe("Page number to retrieve (1-based, default: 1)"),
      sessionId: z.string().optional().describe("Filter by session ID")
    },
    async ({ query, startDate, endDate, tags, importance_min, importance_max, pageSize, page, sessionId }) => {
      try {
        const result = await memoryService.searchMemoriesByTimeRange(query || "", {
          startDate,
          endDate,
          tags,
          importanceMin: importance_min,
          importanceMax: importance_max,
          pageSize: pageSize || 10,
          page: page || 1,
          sessionId
        });

        const response = {
          success: true,
          query: query || "all memories in time range",
          found: result.results.length,
          totalResults: result.pagination.totalResults,
          pagination: result.pagination,
          timeRange: result.timeRange,
          memories: result.results.map(memory => ({
            id: memory.id,
            content: memory.text,
            tags: memory.tags,
            importance: memory.importance,
            score: Math.round(memory.score * 100) / 100,
            context: memory.context,
            source: memory.source,
            timestamp: memory.metadata.timestamp
          }))
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Failed to search memories by time range:', error);
        const errorResult = {
          success: false,
          error: 'Failed to search memories by time range',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(errorResult, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // === KNOWLEDGE GRAPH QUERY TOOL (Direct Neo4j/Cypher Access) ===
  server.tool("query_knowledge_graph",
    {
      query: z.string().describe("Cypher query to execute on Neo4j knowledge graph"),
      parameters: z.record(z.any()).optional().describe("Optional parameters for the Cypher query"),
      limit: z.number().min(1).max(100).optional().describe("Maximum number of results per page (default: 20)"),
      page: z.number().min(1).optional().describe("Page number (1-based, default: 1)")
    },
    async ({ query, parameters, limit, page }) => {
      try {
        await knowledgeGraphServiceInstance.connect();

        const pageSize = limit || 20;
        const currentPage = page || 1;
        const skip = (currentPage - 1) * pageSize;

        // Strip existing SKIP/LIMIT clauses before adding our own
        const cleanQuery = query.trim().replace(/\s+(SKIP|LIMIT)\s+\d+/gi, '');

        // Add SKIP and LIMIT to the query for pagination
        const paginatedQuery = `${cleanQuery} SKIP ${skip} LIMIT ${pageSize}`;

        // Also run count query to get total
        const countQuery = cleanQuery.match(/^(MATCH .+?)(?:RETURN|ORDER BY)/i)?.[1];
        const totalCountQuery = countQuery ? `${countQuery} RETURN count(*) as total` : null;

        // Execute query with pagination
        // Note: runQuery returns an array of record objects, not a result with .records
        const records = await knowledgeGraphServiceInstance.runQuery(paginatedQuery, parameters || {});

        // Try to get total count if we can extract a count query
        let totalResults = -1;
        if (totalCountQuery) {
          const countRecords = await knowledgeGraphServiceInstance.runQuery(totalCountQuery, parameters || {}).catch(() => []);
          totalResults = countRecords[0]?.total || -1;
        }
        const totalPages = totalResults > 0 ? Math.ceil(totalResults / pageSize) : 1;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                query: paginatedQuery,
                found: records.length,
                totalResults: totalResults !== -1 ? totalResults : 'unknown',
                pagination: {
                  page: currentPage,
                  pageSize,
                  totalPages: totalResults !== -1 ? totalPages : 'unknown',
                  hasNext: totalResults !== -1 ? currentPage < totalPages : records.length === pageSize,
                  hasPrevious: currentPage > 1
                },
                records: records // Already mapped to objects by runQuery
              }, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('Cypher query failed:', error);
        // Return full error for debugging (wishlist item #6)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: 'Failed to execute Cypher query',
                details: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
              }, null, 2)
            }
          ],
          isError: true
        };
      }
    }
  );

  // NOTE: semantic_search is now internal-only, used by search_memories
  // Removed from MCP tool exposure per wishlist item #1

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log(' Conscious Memory MCP Server started successfully');
  console.log(' Available tools:');
  console.log('   - save_memory: Save important information');
  console.log('   - search_memories: Search through conscious memories');
  console.log('   - search_memories_by_time_range: Search memories within a time range with pagination');
  console.log('   - update_memory: Update existing memories');
  console.log('   - delete_memory: Delete memories');
  console.log('   - get_memory_tags: List all available tags');
  console.log('   - get_related_memories: Find semantically similar memories');
  console.log('   - get_memory_stats: Get memory statistics');
  console.log('   - query_knowledge_graph: Execute Cypher queries on Neo4j knowledge graph');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log(' Shutting down Conscious Memory MCP Server...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(' Shutting down Conscious Memory MCP Server...');
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error(' Failed to start Conscious Memory MCP Server:', error);
  process.exit(1);
});
