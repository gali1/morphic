// tests/integration/llm-integration.test.ts
// Integration tests for LLM providers and Redis functionality

import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { LLMClient } from '../../lib/llm/client';
import { LLMFactory } from '../../lib/llm/factory';
import { memoryManager } from '../../lib/llm/memory';
import { checkRedisConnection } from '../../lib/redis';
import { checkDatabaseConnection } from '../../lib/db';
import { env } from '../../lib/env';

describe('LLM Integration Tests', () => {
  beforeAll(async () => {
    // Ensure Redis connection is working
    const redisConnected = await checkRedisConnection();
    if (!redisConnected) {
      console.error('Redis connection failed. Tests may not work correctly.');
    }
    
    // Ensure database connection is working
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      console.error('Database connection failed. Tests may not work correctly.');
    }
  });
  
  afterAll(async () => {
    // Clean up any test conversations
    await memoryManager.deleteConversation('test-conversation');
  });
  
  // Test environment configuration
  it('should have required environment variables set', () => {
    expect(env.validate()).toBe(true);
  });
  
  // Test available providers
  it('should detect available LLM providers', () => {
    const providers = LLMFactory.getAvailableProviders();
    console.log('Available providers:', providers);
    expect(providers.length).toBeGreaterThan(0);
  });
  
  // Test available models for each provider
  it('should list available models for each provider', () => {
    const providers = LLMFactory.getAvailableProviders();
    
    providers.forEach(provider => {
      const models = LLMFactory.getModelsForProvider(provider);
      console.log(`Models for ${provider}:`, models);
      expect(models.length).toBeGreaterThan(0);
    });
  });
  
  // Test LLM client instantiation
  it('should create LLM client instance', () => {
    const client = new LLMClient({ conversationId: 'test-conversation' });
    expect(client).toBeDefined();
  });
  
  // Test LLM response generation (mocked)
  it('should generate an LLM response', async () => {
    // Create a mock provider for testing
    const mockProvider = {
      generateResponse: jest.fn().mockResolvedValue('Test response'),
      generateStreamingResponse: jest.fn(),
      searchInternet: jest.fn()
    };
    
    // Mock the factory to return our mock provider
    jest.spyOn(LLMFactory, 'getDefaultProvider').mockReturnValue(mockProvider);
    
    // Create client and generate response
    const client = new LLMClient({ conversationId: 'test-conversation' });
    const response = await client.generateResponse('Test prompt');
    
    expect(response).toBe('Test response');
    expect(mockProvider.generateResponse).toHaveBeenCalled();
  });
  
  // Test search functionality (mocked)
  it('should perform internet search', async () => {
    // Create a mock provider for testing
    const mockProvider = {
      generateResponse: jest.fn(),
      generateStreamingResponse: jest.fn(),
      searchInternet: jest.fn().mockResolvedValue('Search results')
    };
    
    // Mock the factory to return our mock provider
    jest.spyOn(LLMFactory, 'getDefaultProvider').mockReturnValue(mockProvider);
    
    // Create client and perform search
    const client = new LLMClient({ conversationId: 'test-conversation' });
    const results = await client.searchInternet('Test query');
    
    expect(results).toBe('Search results');
    expect(mockProvider.searchInternet).toHaveBeenCalled();
  });
  
  // Test memory manager
  it('should store and retrieve conversation history', async () => {
    // Clear any existing conversation
    await memoryManager.deleteConversation('test-conversation');
    
    // Add messages to conversation
    await memoryManager.addMessage('test-conversation', {
      role: 'user',
      content: 'Test message 1'
    });
    
    await memoryManager.addMessage('test-conversation', {
      role: 'assistant',
      content: 'Test response 1'
    });
    
    // Retrieve conversation
    const conversation = await memoryManager.loadConversation('test-conversation');
    
    expect(conversation).toBeDefined();
    expect(conversation?.messages.length).toBe(2);
    expect(conversation?.messages[0].content).toBe('Test message 1');
    expect(conversation?.messages[1].content).toBe('Test response 1');
  });
  
  // Test streaming response (mocked)
  it('should generate streaming response with callbacks', async () => {
    // Create a mock for the async generator
    const mockStreamGenerator = async function* () {
      yield { content: 'Stream ', done: false };
      yield { content: 'chunk ', done: false };
      yield { content: 'test', done: true };
    };
    
    // Create a mock provider for testing
    const mockProvider = {
      generateResponse: jest.fn(),
      generateStreamingResponse: jest.fn().mockImplementation(() => mockStreamGenerator()),
      searchInternet: jest.fn()
    };
    
    // Mock the factory to return our mock provider
    jest.spyOn(LLMFactory, 'getDefaultProvider').mockReturnValue(mockProvider);
    
    // Create client and generate streaming response
    const client = new LLMClient({ conversationId: 'test-conversation' });
    
    const chunks: string[] = [];
    const onChunk = (chunk: string, done: boolean) => {
      chunks.push(chunk);
      if (done) {
        chunks.push('[DONE]');
      }
    };
    
    const fullResponse = await client.generateStreamingResponse('Test prompt', {}, onChunk);
    
    expect(fullResponse).toBe('Stream chunk test');
    expect(chunks).toEqual(['Stream ', 'chunk ', 'test', '[DONE]']);
    expect(mockProvider.generateStreamingResponse).toHaveBeenCalled();
  });
  
  // Test fallback mechanism (mocked)
  it('should use fallback providers when primary fails', async () => {
    // Create mock providers
    const mockPrimaryProvider = {
      generateResponse: jest.fn().mockRejectedValue(new Error('Primary failed')),
      generateStreamingResponse: jest.fn(),
      searchInternet: jest.fn()
    };
    
    const mockFallbackProvider = {
      generateResponse: jest.fn().mockResolvedValue('Fallback response'),
      generateStreamingResponse: jest.fn(),
      searchInternet: jest.fn()
    };
    
    // Mock the factory methods
    jest.spyOn(LLMFactory, 'getDefaultProvider').mockReturnValue(mockPrimaryProvider);
    jest.spyOn(LLMFactory, 'createFallbackChain').mockReturnValue([mockFallbackProvider]);
    
    // Create client and generate response
    const client = new LLMClient({ conversationId: 'test-conversation', useFallbacks: true });
    const response = await client.generateResponse('Test prompt');
    
    expect(response).toBe('Fallback response');
    expect(mockPrimaryProvider.generateResponse).toHaveBeenCalled();
    expect(mockFallbackProvider.generateResponse).toHaveBeenCalled();
  });
});