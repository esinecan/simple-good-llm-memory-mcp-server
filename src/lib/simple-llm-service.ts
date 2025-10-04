/**
 * Simplified LLM Service for Entity Extraction
 * Uses DeepSeek for extracting entities and relationships from memory content
 */

import { generateText } from 'ai';
import { createDeepSeek } from '@ai-sdk/deepseek';

export interface ExtractedEntity {
  id: string;
  label: string;
  properties: Record<string, any>;
}

export interface ExtractedRelationship {
  sourceEntityId: string;
  targetEntityId: string;
  type: string;
  properties?: Record<string, any>;
}

export interface KnowledgeExtractionResult {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
}

export class SimpleLLMService {
  private model: any;

  constructor() {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new Error('DEEPSEEK_API_KEY not found in environment');
    }

    // Create DeepSeek provider
    const deepseek = createDeepSeek({
      apiKey: apiKey,
    });

    this.model = deepseek('deepseek-chat');
  }

  async extractKnowledge(content: string): Promise<KnowledgeExtractionResult> {
    const prompt = `Extract entities and relationships from the following text. Focus on:
- People, organizations, technologies, concepts, projects
- Actions, relationships, and connections between entities

Text: "${content}"

Return ONLY valid JSON in this exact format:
{
  "entities": [
    {"id": "unique_id", "label": "Person|Technology|Concept|Organization", "properties": {"name": "...", "description": "..."}}
  ],
  "relationships": [
    {"sourceEntityId": "entity1_id", "targetEntityId": "entity2_id", "type": "WORKS_ON|USES|RELATES_TO", "properties": {}}
  ]
}`;

    try {
      const { text } = await generateText({
        model: this.model,
        prompt,
        temperature: 0.1,
      });

      // Clean and parse JSON response
      const cleaned = text.trim()
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const result = JSON.parse(cleaned);

      return {
        entities: result.entities || [],
        relationships: result.relationships || [],
      };
    } catch (error) {
      console.error('Failed to extract knowledge:', error);
      return { entities: [], relationships: [] };
    }
  }
}
