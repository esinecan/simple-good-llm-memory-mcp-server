#!/usr/bin/env tsx
/**
 * End-to-end test for memory system - Phase 1
 * Tests: save → query with metadata
 */

import { getConsciousMemoryService } from './src/lib/conscious-memory.js';

async function testMetadataPersistence() {
  console.log('=== Testing Metadata Persistence ===\n');

  const memoryService = getConsciousMemoryService();
  await memoryService.initialize();

  // Test 1: Save a memory with full metadata
  console.log('1. Saving memory with tags and importance...');
  const memoryId = await memoryService.saveMemory({
    content: 'The skynet-memory-mcp project uses ChromaDB for semantic search and Neo4j for knowledge graph relationships. It was extracted from the skynet-agent codebase.',
    tags: ['architecture', 'technology', 'project'],
    importance: 8,
    source: 'explicit',
    context: 'Testing metadata persistence and entity extraction'
  });
  console.log(`✓ Memory saved: ${memoryId}\n`);

  // Give ChromaDB a moment to process
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Test 2: Verify metadata was saved
  console.log('2. Searching for saved memory...');
  const searchResults = await memoryService.searchMemories('skynet-memory-mcp', { limit: 5 });

  if (searchResults.length > 0) {
    const found = searchResults.find(r => r.id === memoryId);
    if (found) {
      console.log(`✓ Memory found with metadata:`);
      console.log(`  - ID: ${found.id}`);
      console.log(`  - Tags: ${JSON.stringify(found.tags)}`);
      console.log(`  - Importance: ${found.importance}`);
      console.log(`  - Source: ${found.source}`);
      console.log(`  - Context: ${found.context}\n`);

      // Validate
      const hasCorrectTags = found.tags && found.tags.length === 3;
      const hasCorrectImportance = found.importance === 8;
      const hasCorrectSource = found.source === 'explicit';

      if (hasCorrectTags && hasCorrectImportance && hasCorrectSource) {
        console.log('✅ All metadata fields persisted correctly!\n');
      } else {
        console.log('❌ Some metadata fields missing or incorrect\n');
      }
    } else {
      console.log(`✗ Memory not found in search results\n`);
    }
  } else {
    console.log(`✗ No search results found\n`);
  }

  // Test 3: Get stats
  console.log('3. Checking memory stats...');
  const stats = await memoryService.getStats();
  console.log(`✓ Stats retrieved:`);
  console.log(`  - Total memories: ${stats.totalConsciousMemories}`);
  console.log(`  - Unique tags: ${stats.tagCount}`);
  console.log(`  - Avg importance: ${stats.averageImportance.toFixed(2)}\n`);

  // Test 4: Search by tags
  console.log('4. Searching by tag "architecture"...');
  const tagResults = await memoryService.searchMemories('', {
    tags: ['architecture'],
    limit: 10
  });
  console.log(`✓ Found ${tagResults.length} memories with tag "architecture"\n`);

  console.log('=== Metadata Test Complete ===');
  process.exit(0);
}

testMetadataPersistence().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
