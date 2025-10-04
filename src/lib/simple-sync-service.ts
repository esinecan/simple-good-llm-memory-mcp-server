/**
 * Simplified Knowledge Graph Sync Service
 * Processes unsynced memories from ChromaDB and enriches them in Neo4j
 */

import knowledgeGraphService from './knowledge-graph-service.js';
import { getMemoryStore } from './memory-store.js';
import { SimpleLLMService } from './simple-llm-service.js';
import { KgNode, KgRelationship } from '../types/knowledge-graph.js';

export interface SyncResult {
  processed: number;
  errors: number;
  skipped: number;
}

export class SimpleSyncService {
  private kgService: typeof knowledgeGraphService;
  private memoryStore: ReturnType<typeof getMemoryStore>;
  private llmService: SimpleLLMService;
  private lastSyncTime: number = 0;

  constructor() {
    this.kgService = knowledgeGraphService;
    this.memoryStore = getMemoryStore();
    this.llmService = new SimpleLLMService();
  }

  async syncKnowledgeGraph(options: { forceFullResync?: boolean } = {}): Promise<SyncResult> {
    const result: SyncResult = { processed: 0, errors: 0, skipped: 0 };

    try {
      // Initialize memory store
      await this.memoryStore.initialize();

      // Get all memories (simplified - no time filtering for now)
      const memories = await this.memoryStore.retrieveMemories('', {
        limit: 100,
      });

      console.log(`📊 [Sync] Found ${memories.length} memories to process`);

      for (const memory of memories) {
        try {
          // Extract entities and relationships using LLM
          const extraction = await this.llmService.extractKnowledge(memory.text);

          // Create memory node
          const memoryNode: KgNode = {
            id: `Memory_${memory.id}`,
            type: 'Memory',
            properties: {
              memoryId: memory.id,
              content: memory.text,
              timestamp: memory.metadata.timestamp || Date.now(),
            },
          };

          await this.kgService.addNode(memoryNode);

          // Add extracted entities
          for (const entity of extraction.entities) {
            const entityNode: KgNode = {
              id: entity.id,
              type: entity.label,
              properties: entity.properties,
            };

            await this.kgService.addNode(entityNode);

            // Link memory to entity
            const memToEntity: KgRelationship = {
              id: `rel-${memoryNode.id}-mentions-${entity.id}`,
              sourceNodeId: memoryNode.id,
              targetNodeId: entity.id,
              type: 'MENTIONS',
              properties: {},
            };

            await this.kgService.addRelationship(memToEntity);
          }

          // Add extracted relationships
          for (const rel of extraction.relationships) {
            const relationship: KgRelationship = {
              id: `rel-${rel.sourceEntityId}-${rel.type}-${rel.targetEntityId}`,
              sourceNodeId: rel.sourceEntityId,
              targetNodeId: rel.targetEntityId,
              type: rel.type,
              properties: rel.properties || {},
            };

            await this.kgService.addRelationship(relationship);
          }

          result.processed++;
        } catch (error) {
          console.error(`❌ [Sync] Error processing memory ${memory.id}:`, error);
          result.errors++;
        }
      }

      this.lastSyncTime = Date.now();
      return result;
    } catch (error) {
      console.error('❌ [Sync] Fatal error during sync:', error);
      throw error;
    }
  }
}

// Export singleton
const simpleSyncServiceInstance = new SimpleSyncService();
export default simpleSyncServiceInstance;
