// lib/llm/client.ts
// Main LLM client interface

import { LLMFactory } from './factory';
import { LLMProvider, LLMMessage, LLMRequestOptions, LLMResponseChunk, generateSystemPrompt } from './config';
import { memoryManager } from './memory';
import { searchSearXNG, summarizeSearchResults, optimizeSearchQuery } from '../search/searxng';

/**
 * Main LLM Client
 * Provides a unified interface for interacting with different LLM providers
 */
export class LLMClient {
  private provider: LLMProvider;
  private conversationId: string;
  private fallbackProviders: LLMProvider[] = [];
  
  /**
   * Create a new LLM client
   * 
   * @param {Object} options - Configuration options
   */
  constructor(options: {
    provider?: string;
    model?: string;
    conversationId?: string;
    useFallbacks?: boolean;
  } = {}) {
    const { provider, model, conversationId, useFallbacks = true } = options;
    
    // Initialize provider
    if (provider) {
      this.provider = LLMFactory.getProvider(provider, model);
    } else {
      const defaultProvider = LLMFactory.getDefaultProvider();
      if (!defaultProvider) {
        throw new Error('No LLM providers available. Check API keys configuration.');
      }
      this.provider = defaultProvider;
    }
    
    // Set conversation ID or generate random one
    this.conversationId = conversationId || this.generateRandomId();
    
    // Set up fallback providers if enabled
    if (useFallbacks) {
      this.fallbackProviders = LLMFactory.createFallbackChain()
        .filter(p => p !== this.provider); // Exclude current provider
    }
  }
  
  /**
   * Generate a random ID for a new conversation
   * 
   * @returns {string} Random ID
   */
  private generateRandomId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
  
  /**
   * Generate a response from the LLM
   * 
   * @param {string} prompt - User message
   * @param {Object} options - Additional options
   * @returns {Promise<string>} Generated response
   */
  async generateResponse(
    prompt: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      useMemory?: boolean;
      useSearch?: boolean;
    } = {}
  ): Promise<string> {
    const { systemPrompt, temperature, maxTokens, useMemory = true, useSearch = false } = options;
    
    try {
      // Load conversation history if memory is enabled
      let messages: LLMMessage[] = [];
      let memoryContext: string | undefined;
      
      if (useMemory) {
        const conversation = await memoryManager.loadConversation(this.conversationId);
        if (conversation) {
          messages = [...conversation.messages];
          memoryContext = conversation.summary;
        }
      }
      
      // Add current user message
      const userMessage: LLMMessage = { role: 'user', content: prompt };
      messages.push(userMessage);
      
      // Update memory with user message
      if (useMemory) {
        await memoryManager.addMessage(this.conversationId, userMessage);
      }
      
      // Create enhanced system prompt with memory context
      const enhancedSystemPrompt = systemPrompt || generateSystemPrompt(memoryContext);
      
      // Try primary provider
      try {
        const response = await this.provider.generateResponse({
          systemPrompt: enhancedSystemPrompt,
          messages,
          temperature,
          maxTokens,
          useSearch
        });
        
        // Save assistant's response to memory
        if (useMemory) {
          const assistantMessage: LLMMessage = { role: 'assistant', content: response };
          await memoryManager.addMessage(this.conversationId, assistantMessage);
        }
        
        return response;
      } catch (error) {
        console.error('Primary provider failed:', error);
        
        // Try fallback providers if available
        if (this.fallbackProviders.length > 0) {
          for (const fallbackProvider of this.fallbackProviders) {
            try {
              console.log(`Trying fallback provider: ${fallbackProvider.constructor.name}`);
              
              const response = await fallbackProvider.generateResponse({
                systemPrompt: enhancedSystemPrompt,
                messages,
                temperature,
                maxTokens,
                useSearch
              });
              
              // Save assistant's response to memory
              if (useMemory) {
                const assistantMessage: LLMMessage = { role: 'assistant', content: response };
                await memoryManager.addMessage(this.conversationId, assistantMessage);
              }
              
              return response;
            } catch (fallbackError) {
              console.error(`Fallback provider ${fallbackProvider.constructor.name} failed:`, fallbackError);
              // Continue to next fallback
            }
          }
        }
        
        // If all providers fail, rethrow the original error
        throw error;
      }
    } catch (error) {
      console.error('All LLM providers failed:', error);
      return 'Sorry, I encountered an error while processing your request. Please try again later.';
    }
  }
  
  /**
   * Generate a streaming response from the LLM
   * 
   * @param {string} prompt - User message
   * @param {Object} options - Additional options
   * @param {Function} onChunk - Callback for each chunk of the response
   * @returns {Promise<string>} Complete generated response
   */
  async generateStreamingResponse(
    prompt: string,
    options: {
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      useMemory?: boolean;
      useSearch?: boolean;
    } = {},
    onChunk: (chunk: string, done: boolean) => void
  ): Promise<string> {
    const { systemPrompt, temperature, maxTokens, useMemory = true, useSearch = false } = options;
    
    try {
      // Load conversation history if memory is enabled
      let messages: LLMMessage[] = [];
      let memoryContext: string | undefined;
      
      if (useMemory) {
        const conversation = await memoryManager.loadConversation(this.conversationId);
        if (conversation) {
          messages = [...conversation.messages];
          memoryContext = conversation.summary;
        }
      }
      
      // Add current user message
      const userMessage: LLMMessage = { role: 'user', content: prompt };
      messages.push(userMessage);
      
      // Update memory with user message
      if (useMemory) {
        await memoryManager.addMessage(this.conversationId, userMessage);
      }
      
      // Create enhanced system prompt with memory context
      const enhancedSystemPrompt = systemPrompt || generateSystemPrompt(memoryContext);
      
      // Try primary provider
      try {
        let fullResponse = '';
        
        // Process streaming response
        for await (const chunk of this.provider.generateStreamingResponse({
          systemPrompt: enhancedSystemPrompt,
          messages,
          temperature,
          maxTokens,
          useSearch
        })) {
          fullResponse += chunk.content;
          onChunk(chunk.content, chunk.done);
        }
        
        // Save assistant's response to memory
        if (useMemory) {
          const assistantMessage: LLMMessage = { role: 'assistant', content: fullResponse };
          await memoryManager.addMessage(this.conversationId, assistantMessage);
        }
        
        return fullResponse;
      } catch (error) {
        console.error('Primary streaming provider failed:', error);
        
        // Try fallback providers if available
        if (this.fallbackProviders.length > 0) {
          for (const fallbackProvider of this.fallbackProviders) {
            try {
              console.log(`Trying fallback streaming provider: ${fallbackProvider.constructor.name}`);
              
              let fallbackResponse = '';
              
              // Process streaming response from fallback
              for await (const chunk of fallbackProvider.generateStreamingResponse({
                systemPrompt: enhancedSystemPrompt,
                messages,
                temperature,
                maxTokens,
                useSearch
              })) {
                fallbackResponse += chunk.content;
                onChunk(chunk.content, chunk.done);
              }
              
              // Save assistant's response to memory
              if (useMemory) {
                const assistantMessage: LLMMessage = { role: 'assistant', content: fallbackResponse };
                await memoryManager.addMessage(this.conversationId, assistantMessage);
              }
              
              return fallbackResponse;
            } catch (fallbackError) {
              console.error(`Fallback streaming provider ${fallbackProvider.constructor.name} failed:`, fallbackError);
              // Continue to next fallback
            }
          }
        }
        
        // If all providers fail, rethrow the original error
        throw error;
      }
    } catch (error) {
      console.error('All LLM streaming providers failed:', error);
      const errorMessage = 'Sorry, I encountered an error while processing your streaming request. Please try again later.';
      onChunk(errorMessage, true);
      return errorMessage;
    }
  }
  
  /**
   * Search the internet using the current provider
   * 
   * @param {string} query - Search query
   * @returns {Promise<string>} Formatted search results
   */
  async searchInternet(query: string): Promise<string> {
    try {
      const optimizedQuery = optimizeSearchQuery(query);
      return await this.provider.searchInternet(optimizedQuery);
    } catch (error) {
      console.error('Search error:', error);
      
      // Try direct SearXNG search as fallback
      try {
        const results = await searchSearXNG(query);
        return summarizeSearchResults(results);
      } catch (searchError) {
        console.error('Fallback search error:', searchError);
        return 'Sorry, I encountered an error while searching the internet.';
      }
    }
  }
  
  /**
   * Get available LLM providers
   * 
   * @returns {string[]} Array of provider names
   */
  static getAvailableProviders(): string[] {
    return LLMFactory.getAvailableProviders();
  }
  
  /**
   * Get available models for a provider
   * 
   * @param {string} provider - Provider name
   * @returns {string[]} Array of model names
   */
  static getModelsForProvider(provider: string): string[] {
    return LLMFactory.getModelsForProvider(provider);
  }
  
  /**
   * Clear conversation history
   * 
   * @returns {Promise<boolean>} Success status
   */
  async clearConversation(): Promise<boolean> {
    return await memoryManager.deleteConversation(this.conversationId);
  }
}