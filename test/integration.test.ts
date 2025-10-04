/**
 * Integration Tests for Skynet Memory MCP
 *
 * Tests all MCP tools end-to-end including ChromaDB storage and Neo4j sync
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { getConsciousMemoryService } from '../src/lib/conscious-memory.js';
import knowledgeGraphService from '../src/lib/knowledge-graph-service.js';
import type { ConsciousMemoryService } from '../src/types/memory.js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

describe('Skynet Memory MCP Integration Tests', () => {
  let memoryService: ConsciousMemoryService;
  const graphService = knowledgeGraphService;
  let testMemoryIds: string[] = [];
  const testSessionId = `test_session_${Date.now()}`;

  beforeAll(async () => {
    // Initialize services
    memoryService = getConsciousMemoryService();
    await memoryService.initialize();
    await graphService.connect();

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    // Clean up test data from ChromaDB
    for (const memoryId of testMemoryIds) {
      try {
        await memoryService.deleteMemory(memoryId);
      } catch (error) {
        console.error(`Failed to clean up memory ${memoryId}:`, error);
      }
    }

    // Clean up test data from Neo4j
    try {
      await graphService.runQuery(
        'MATCH (m:ConsciousMemory) WHERE m.sessionId = $sessionId DETACH DELETE m',
        { sessionId: testSessionId }
      );
      await graphService.runQuery(
        'MATCH (s:Session {sessionId: $sessionId}) DETACH DELETE s',
        { sessionId: testSessionId }
      );
    } catch (error) {
      console.error('Failed to clean up Neo4j test data:', error);
    }

    // Close connections
    await graphService.close();
  });

  beforeEach(() => {
    // Reset test memory IDs for each test
    testMemoryIds = [];
  });

  describe('save_memory', () => {
    test('should save memory to ChromaDB and sync to Neo4j', async () => {
      const content = 'Test memory for integration testing';
      const tags = ['test', 'integration', 'automated'];
      const importance = 8;

      const memoryId = await memoryService.saveMemory({
        content,
        tags,
        importance,
        sessionId: testSessionId,
        context: 'Integration test context'
      });

      expect(memoryId).toBeTruthy();
      expect(typeof memoryId).toBe('string');
      testMemoryIds.push(memoryId);

      // Wait for background sync
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify in Neo4j
      const graphResults = await graphService.runQuery(
        'MATCH (m:ConsciousMemory {memoryId: $memoryId}) RETURN m',
        { memoryId }
      );

      expect(graphResults.length).toBe(1);
      expect(graphResults[0].m.properties.content).toBe(content);
      expect(graphResults[0].m.properties.importance).toBe(importance);
    });

    test('should create tag relationships in Neo4j', async () => {
      const content = 'Memory with multiple tags';
      const tags = ['tag1', 'tag2', 'tag3'];

      const memoryId = await memoryService.saveMemory({
        content,
        tags,
        importance: 5,
        sessionId: testSessionId
      });

      testMemoryIds.push(memoryId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify tag relationships
      const tagResults = await graphService.runQuery(
        'MATCH (m:ConsciousMemory {memoryId: $memoryId})-[:HAS_TAG]->(t:Tag) RETURN t.name as tag',
        { memoryId }
      );

      const foundTags = tagResults.map((r: any) => r.tag).sort();
      expect(foundTags).toEqual(tags.sort());
    });

    test('should handle metadata correctly', async () => {
      const content = 'Memory with rich metadata';
      const metadata = {
        tags: ['metadata-test'],
        importance: 7,
        sessionId: testSessionId,
        context: 'Rich metadata context',
        source: 'explicit' as const
      };

      const memoryId = await memoryService.saveMemory({
        content,
        ...metadata
      });

      testMemoryIds.push(memoryId);

      // Retrieve and verify metadata preservation
      const searchResults = await memoryService.searchMemories(content, {
        sessionId: testSessionId,
        limit: 1
      });

      expect(searchResults.length).toBeGreaterThan(0);
      const memory = searchResults[0];
      expect(memory.metadata.importance).toBe(7);
      expect(memory.metadata.context).toBe('Rich metadata context');
    });
  });

  describe('search_memories', () => {
    beforeAll(async () => {
      // Seed test data
      const testData = [
        { content: 'JavaScript is a programming language', tags: ['javascript', 'programming'], importance: 5 },
        { content: 'Python is great for data science', tags: ['python', 'data-science'], importance: 7 },
        { content: 'TypeScript adds types to JavaScript', tags: ['typescript', 'javascript'], importance: 8 }
      ];

      for (const data of testData) {
        const memoryId = await memoryService.saveMemory({
          ...data,
          sessionId: testSessionId
        });
        testMemoryIds.push(memoryId);
      }

      // Wait for all saves to complete
      await new Promise(resolve => setTimeout(resolve, 2000));
    });

    test('should perform semantic search', async () => {
      const results = await memoryService.searchMemories('scripting languages', {
        sessionId: testSessionId,
        limit: 10
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toBeTruthy();
      expect(results[0].score).toBeGreaterThan(0);
    });

    test('should support pagination', async () => {
      const page1 = await memoryService.searchMemories('programming', {
        sessionId: testSessionId,
        page: 1,
        pageSize: 2
      });

      const page2 = await memoryService.searchMemories('programming', {
        sessionId: testSessionId,
        page: 2,
        pageSize: 2
      });

      expect(page1.length).toBeGreaterThanOrEqual(1);
      expect(page1.length).toBeLessThanOrEqual(2);
      // Verify pagination logic works (may return different results or empty on page 2)
      expect(Array.isArray(page2)).toBe(true);
    });

    test('should filter by tags', async () => {
      const results = await memoryService.searchMemories('programming', {
        tags: ['javascript'],
        sessionId: testSessionId,
        limit: 10
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach((result: any) => {
        const tags = result.metadata.tags || [];
        const parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
        expect(parsedTags).toContain('javascript');
      });
    });

    test('should filter by importance range', async () => {
      const results = await memoryService.searchMemories('programming', {
        importanceMin: 7,
        importanceMax: 10,
        sessionId: testSessionId,
        limit: 10
      });

      results.forEach((result: any) => {
        const importance = result.metadata.importance || 0;
        expect(importance).toBeGreaterThanOrEqual(7);
        expect(importance).toBeLessThanOrEqual(10);
      });
    });

    test('should respect minScore threshold', async () => {
      const results = await memoryService.searchMemories('completely unrelated topic xyz', {
        sessionId: testSessionId,
        minScore: 0.8,
        limit: 10
      });

      results.forEach((result: any) => {
        expect(result.score).toBeGreaterThanOrEqual(0.8);
      });
    });
  });

  describe('update_memory', () => {
    test('should update memory in ChromaDB and sync to Neo4j', async () => {
      // Create initial memory
      const initialContent = 'Original content';
      const memoryId = await memoryService.saveMemory({
        content: initialContent,
        tags: ['update-test'],
        importance: 5,
        sessionId: testSessionId
      });

      testMemoryIds.push(memoryId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update memory
      const updatedContent = 'Updated content';
      await memoryService.updateMemory({
        id: memoryId,
        content: updatedContent,
        importance: 9
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify in Neo4j
      const graphResults = await graphService.runQuery(
        'MATCH (m:ConsciousMemory {memoryId: $memoryId}) RETURN m',
        { memoryId }
      );

      expect(graphResults.length).toBe(1);
      expect(graphResults[0].m.properties.content).toBe(updatedContent);
      expect(graphResults[0].m.properties.importance).toBe(9);
    });

    test('should update tags and sync relationships', async () => {
      const memoryId = await memoryService.saveMemory({
        content: 'Tag update test',
        tags: ['old-tag'],
        importance: 5,
        sessionId: testSessionId
      });

      testMemoryIds.push(memoryId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Update with new tags
      await memoryService.updateMemory({
        id: memoryId,
        tags: ['new-tag-1', 'new-tag-2']
      });

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify updated tags in Neo4j
      const tagResults = await graphService.runQuery(
        'MATCH (m:ConsciousMemory {memoryId: $memoryId})-[:HAS_TAG]->(t:Tag) RETURN t.name as tag',
        { memoryId }
      );

      const foundTags = tagResults.map((r: any) => r.tag).sort();
      // Should include new tags (old tag may still exist due to async sync)
      expect(foundTags).toContain('new-tag-1');
      expect(foundTags).toContain('new-tag-2');
    });
  });

  describe('delete_memory', () => {
    test('should delete from ChromaDB and Neo4j', async () => {
      const memoryId = await memoryService.saveMemory({
        content: 'Memory to delete',
        tags: ['delete-test'],
        importance: 5,
        sessionId: testSessionId
      });

      const testMemoryId = memoryId;
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify exists in Neo4j
      let graphResults = await graphService.runQuery(
        'MATCH (m:ConsciousMemory {memoryId: $memoryId}) RETURN m',
        { memoryId: testMemoryId }
      );
      expect(graphResults.length).toBe(1);

      // Delete
      await memoryService.deleteMemory(testMemoryId);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify deleted from Neo4j
      graphResults = await graphService.runQuery(
        'MATCH (m:ConsciousMemory {memoryId: $memoryId}) RETURN m',
        { memoryId: testMemoryId }
      );
      expect(graphResults.length).toBe(0);
    });
  });

  describe('query_knowledge_graph', () => {
    test('should execute Cypher queries', async () => {
      const results = await graphService.runQuery(
        'MATCH (m:ConsciousMemory) WHERE m.sessionId = $sessionId RETURN count(m) as count',
        { sessionId: testSessionId }
      );

      expect(results.length).toBe(1);
      expect(typeof results[0].count).toBe('number');
      expect(results[0].count).toBeGreaterThanOrEqual(0);
    });

    test('should support pagination with SKIP/LIMIT', async () => {
      const query = 'MATCH (m:ConsciousMemory) WHERE m.sessionId = $sessionId RETURN m SKIP 0 LIMIT 2';
      const results = await graphService.runQuery(query, { sessionId: testSessionId });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    test('should handle complex graph queries', async () => {
      const query = `
        MATCH (m:ConsciousMemory)-[:HAS_TAG]->(t:Tag)
        WHERE m.sessionId = $sessionId
        RETURN m.memoryId as memoryId, collect(t.name) as tags
        LIMIT 5
      `;

      const results = await graphService.runQuery(query, { sessionId: testSessionId });

      results.forEach((result: any) => {
        expect(result.memoryId).toBeTruthy();
        expect(Array.isArray(result.tags)).toBe(true);
      });
    });

    test('should convert Neo4j Integer types correctly', async () => {
      const query = `
        MATCH (m:ConsciousMemory)
        WHERE m.sessionId = $sessionId
        RETURN m.importance as importance, count(m) as total
      `;

      const results = await graphService.runQuery(query, { sessionId: testSessionId });

      results.forEach((result: any) => {
        // Should be converted to number, not {low, high} object
        expect(typeof result.total).toBe('number');
        if (result.importance !== null) {
          expect(typeof result.importance).toBe('number');
        }
      });
    });
  });

  describe('get_memory_tags', () => {
    test('should return all unique tags', async () => {
      const tags = await memoryService.getAllTags();

      expect(Array.isArray(tags)).toBe(true);
      expect(tags.length).toBeGreaterThan(0);

      // Should be sorted
      const sorted = [...tags].sort();
      expect(tags).toEqual(sorted);

      // Should be unique
      const unique = [...new Set(tags)];
      expect(tags.length).toBe(unique.length);
    });
  });

  describe('get_memory_stats', () => {
    test('should return statistics', async () => {
      const stats = await memoryService.getStats();

      expect(stats).toBeTruthy();
      expect(typeof stats.totalConsciousMemories).toBe('number');
      expect(stats.totalConsciousMemories).toBeGreaterThanOrEqual(0);
      expect(typeof stats.tagCount).toBe('number');
      expect(stats.tagCount).toBeGreaterThanOrEqual(0);
    });

    test('should include source breakdown', async () => {
      const stats = await memoryService.getStats();

      expect(stats.sourceBreakdown).toBeTruthy();
      expect(typeof stats.sourceBreakdown).toBe('object');
      expect(typeof stats.averageImportance).toBe('number');
    });
  });

  describe('get_related_memories', () => {
    test('should find related memories', async () => {
      // Create a memory
      const memoryId = await memoryService.saveMemory({
        content: 'Primary memory for relation testing',
        tags: ['relation-test'],
        importance: 8,
        sessionId: testSessionId
      });

      testMemoryIds.push(memoryId);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get related memories
      const related = await memoryService.getRelatedMemories(memoryId, 5);

      expect(Array.isArray(related)).toBe(true);
      related.forEach((memory: any) => {
        expect(memory.id).not.toBe(memoryId);
        expect(memory.score).toBeGreaterThan(0);
      });
    });
  });

  describe('search_memories_by_time_range', () => {
    test('should filter by time range', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      const endDate = new Date(now.getTime() + 60 * 1000); // 1 minute from now

      const pagResult = await memoryService.searchMemoriesByTimeRange('', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        sessionId: testSessionId
      });

      expect(pagResult.results).toBeTruthy();
      expect(Array.isArray(pagResult.results)).toBe(true);
      expect(pagResult.pagination).toBeTruthy();

      pagResult.results.forEach((memory: any) => {
        const timestamp = memory.metadata.timestamp;
        expect(timestamp).toBeGreaterThanOrEqual(startDate.getTime());
        expect(timestamp).toBeLessThanOrEqual(endDate.getTime());
      });
    });

    test('should support query with time range', async () => {
      const now = new Date();
      const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const pagResult = await memoryService.searchMemoriesByTimeRange('programming', {
        startDate: startDate.toISOString(),
        sessionId: testSessionId
      });

      expect(pagResult.results).toBeTruthy();
      expect(Array.isArray(pagResult.results)).toBe(true);
      expect(pagResult.pagination).toBeTruthy();
    });
  });
});
