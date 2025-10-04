#!/usr/bin/env node
/**
 * Background Knowledge Graph Sync Service
 *
 * Processes unsynced memories from ChromaDB and enriches them in Neo4j:
 * - Extracts entities and relationships using LLM
 * - Creates nodes and relationships in knowledge graph
 * - Runs continuously or one-time
 *
 * Usage:
 *   npm run sync          # One-time sync
 *   npm run sync:watch    # Continuous background service
 */

import { config } from 'dotenv';
import { join } from 'path';

// Load environment variables
config({ path: join(__dirname, '../.env') });
config({ path: join(__dirname, '../.env.local') });

import simpleSyncServiceInstance from './lib/simple-sync-service.js';
import knowledgeGraphServiceInstance from './lib/knowledge-graph-service.js';

// Parse command line arguments
const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const forceFullResync = args.includes('--full-resync');
const syncIntervalMs = 30000; // 30 seconds between syncs

async function runSync() {
  try {
    console.log('🔄 [KG Sync] Starting knowledge graph synchronization...');

    // Ensure Neo4j is connected
    await knowledgeGraphServiceInstance.connect();
    console.log('✅ [KG Sync] Connected to Neo4j');

    // Run the sync
    const result = await simpleSyncServiceInstance.syncKnowledgeGraph({
      forceFullResync
    });

    console.log(`✅ [KG Sync] Completed: ${result.processed} memories processed, ${result.errors} errors`);

    return result;
  } catch (error) {
    console.error('❌ [KG Sync] Error during sync:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 [KG Sync] Starting Skynet Memory Background Sync Service');
  console.log(`📊 [KG Sync] Mode: ${watchMode ? 'WATCH (continuous)' : 'ONE-TIME'}`);
  console.log(`🔄 [KG Sync] Full resync: ${forceFullResync ? 'YES' : 'NO'}`);

  if (watchMode) {
    // Continuous sync mode
    console.log(`⏰ [KG Sync] Sync interval: ${syncIntervalMs / 1000}s`);

    // Initial sync
    await runSync();

    // Set up interval
    setInterval(async () => {
      console.log('\\n⏰ [KG Sync] Running scheduled sync...');
      await runSync();
    }, syncIntervalMs);

    console.log('👀 [KG Sync] Watching for new memories...');
  } else {
    // One-time sync
    await runSync();
    process.exit(0);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\\n🛑 [KG Sync] Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\\n🛑 [KG Sync] Shutting down gracefully...');
  process.exit(0);
});

main().catch((error) => {
  console.error('❌ [KG Sync] Fatal error:', error);
  process.exit(1);
});
