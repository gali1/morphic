// lib/llm/memory.ts
// Conversation memory management using Redis

import { kv, setWithExpiry, getAndParse } from '../redis';
import { LLMMessage } from './config';
import { env } from '../env';

interface ConversationState {
  messages: LLMMessage[];
  summary?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Conversation Memory Manager
 * Handles storing and retrieving conversation history from Redis
 */
export class MemoryManager {
  private readonly MEMORY_EXPIRY_SECONDS = 24 * 60 * 60; // 24 hours
  private readonly SUMMARY_MESSAGE_THRESHOLD = 10; // Generate summary after this many messages
  private readonly MAX_MESSAGES_TO_KEEP = 50; // Maximum number of messages to store
  
  /**
   * Generate Redis key for a conversation
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @returns {string} Redis key
   */
  private getRedisKey(conversationId: string): string {
    return `conv:${conversationId}`;
  }
  
  /**
   * Load conversation history from Redis
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @returns {Promise<ConversationState | null>} Conversation state or null if not found
   */
  async loadConversation(conversationId: string): Promise<ConversationState | null> {
    try {
      const redisKey = this.getRedisKey(conversationId);
      return await getAndParse<ConversationState>(redisKey);
    } catch (error) {
      console.error(`Failed to load conversation ${conversationId}:`, error);
      return null;
    }
  }
  
  /**
   * Save conversation history to Redis
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {ConversationState} state - Conversation state to save
   * @returns {Promise<boolean>} Success status
   */
  async saveConversation(conversationId: string, state: ConversationState): Promise<boolean> {
    try {
      const redisKey = this.getRedisKey(conversationId);
      
      // Update timestamps
      state.updatedAt = Date.now();
      
      return await setWithExpiry(redisKey, state, this.MEMORY_EXPIRY_SECONDS);
    } catch (error) {
      console.error(`Failed to save conversation ${conversationId}:`, error);
      return false;
    }
  }
  
  /**
   * Add a new message to the conversation history
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @param {LLMMessage} message - New message to add
   * @returns {Promise<ConversationState | null>} Updated conversation state or null if failed
   */
  async addMessage(conversationId: string, message: LLMMessage): Promise<ConversationState | null> {
    try {
      // Load existing conversation or create new one
      let conversation = await this.loadConversation(conversationId);
      
      if (!conversation) {
        conversation = {
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
      }
      
      // Add new message
      conversation.messages.push(message);
      
      // Prune conversation if it exceeds max length
      if (conversation.messages.length > this.MAX_MESSAGES_TO_KEEP) {
        // Keep the first message (usually system message) and the most recent messages
        const systemMessage = conversation.messages[0].role === 'system' ? [conversation.messages[0]] : [];
        const recentMessages = conversation.messages.slice(-this.MAX_MESSAGES_TO_KEEP + systemMessage.length);
        
        conversation.messages = [...systemMessage, ...recentMessages];
      }
      
      // Generate conversation summary if needed
      if (conversation.messages.length >= this.SUMMARY_MESSAGE_THRESHOLD && !conversation.summary) {
        conversation.summary = await this.generateConversationSummary(conversation.messages);
      }
      
      // Save updated conversation
      const saved = await this.saveConversation(conversationId, conversation);
      
      return saved ? conversation : null;
    } catch (error) {
      console.error(`Failed to add message to conversation ${conversationId}:`, error);
      return null;
    }
  }
  
  /**
   * Delete a conversation from Redis
   * 
   * @param {string} conversationId - Unique conversation identifier
   * @returns {Promise<boolean>} Success status
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      const redisKey = this.getRedisKey(conversationId);
      await kv.del(redisKey);
      return true;
    } catch (error) {
      console.error(`Failed to delete conversation ${conversationId}:`, error);
      return false;
    }
  }
  
  /**
   * Generate a summary of the conversation
   * This can be used as context for future messages to maintain continuity
   * 
   * @param {LLMMessage[]} messages - Messages to summarize
   * @returns {Promise<string>} Conversation summary
   */
  private async generateConversationSummary(messages: LLMMessage[]): Promise<string> {
    // Simple summarization by extracting key topic sentences
    // In a real implementation, you would use an LLM to generate a proper summary
    
    const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
    
    if (userMessages.length === 0) {
      return "No conversation history.";
    }
    
    // Extract first sentence from each user message as a simple summary
    const sentences = userMessages
      .map(content => {
        const firstSentence = content.split(/[.!?]/) // Split by sentence terminators
          .filter(s => s.trim().length > 0)[0]; // Get first non-empty sentence
        return firstSentence ? firstSentence.trim() + '.' : '';
      })
      .filter(s => s.length > 0);
    
    // Get the last few topic sentences (up to 5)
    const topicSentences = sentences.slice(-5);
    
    return `The conversation covers these topics: ${topicSentences.join(' ')}`;
  }
}

// Export singleton instance
export const memoryManager = new MemoryManager();