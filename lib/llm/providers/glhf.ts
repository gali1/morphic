// lib/llm/providers/glhf.ts
// GLHF LLM Provider Implementation

import axios from 'axios';
import { LLMProvider, LLMRequestOptions, LLMResponseChunk, generateSystemPrompt, withRetry } from '../config';
import { searchSearXNG, summarizeSearchResults, optimizeSearchQuery } from '../../search/searxng';
import { env } from '../../env';

export class GLHFProvider implements LLMProvider {
    private apiKey: string;
    private baseUrl: string;
    private defaultModel: string;

    constructor(model: string = 'mixtral-8x7b-32768') {
        this.apiKey = env.GLHF_API_KEY;
        this.baseUrl = 'https://api.glhf.ai/v1';
        this.defaultModel = model;

        if (!this.apiKey) {
            console.warn('GLHF API key not found. GLHF provider will not function properly.');
        }
    }

    /**
     * Make a request to the GLHF API
     * 
     * @param {LLMRequestOptions} options - Request options
     * @returns {Promise<any>} API response
     */
    private async makeRequest(options: LLMRequestOptions): Promise<any> {
        const { systemPrompt, messages, temperature = 0.7, maxTokens = 2048, useSearch } = options;

        // Enhanced system prompt with time and memory context
        const enhancedSystemPrompt = systemPrompt || generateSystemPrompt();

        // Convert to the format expected by GLHF API (similar to OpenAI)
        const apiMessages = [
            { role: 'system', content: enhancedSystemPrompt },
            ...messages
        ];

        // If search is enabled and the last message is from user, try to search
        if (useSearch && messages.length > 0 && messages[messages.length - 1].role === 'user') {
            const userQuery = messages[messages.length - 1].content;
            const searchQuery = optimizeSearchQuery(userQuery);

            try {
                const searchResults = await this.searchInternet(searchQuery);

                if (searchResults && searchResults.trim() !== 'No search results found.') {
                    // Add search results as a system message before generating response
                    apiMessages.push({
                        role: 'system',
                        content: `Search results for "${searchQuery}":\n${searchResults}\n\nPlease use these search results to provide an up-to-date response.`
                    });
                }
            } catch (error) {
                console.error('Error during GLHF search:', error);
                // Continue without search results if search fails
            }
        }

        // Make the API request
        return await axios.post(
            `${this.baseUrl}/chat/completions`,
            {
                model: this.defaultModel,
                messages: apiMessages,
                temperature,
                max_tokens: maxTokens,
                stream: options.streamCallback ? true : false,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                responseType: options.streamCallback ? 'stream' : 'json',
            }
        );
    }

    /**
     * Generate a response from the LLM
     * 
     * @param {LLMRequestOptions} options - Request options
     * @returns {Promise<string>} Generated text response
     */
    async generateResponse(options: LLMRequestOptions): Promise<string> {
        try {
            // Use retry mechanism for API requests
            const response = await withRetry(async () => {
                return await this.makeRequest(options);
            });

            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                throw new Error('Invalid response format from GLHF API');
            }

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('Error generating response with GLHF:', error);
            return 'Sorry, I encountered an error while processing your request. Please try again later.';
        }
    }

    /**
     * Generate a streaming response from the LLM
     * 
     * @param {LLMRequestOptions} options - Request options
     * @returns {AsyncGenerator<LLMResponseChunk, void, unknown>} Stream of response chunks
     */
    async *generateStreamingResponse(options: LLMRequestOptions): AsyncGenerator<LLMResponseChunk, void, unknown> {
        try {
            const response = await withRetry(async () => {
                return await this.makeRequest({
                    ...options,
                    streamCallback: () => { }, // Enable streaming mode
                });
            });

            // Process the stream
            for await (const chunk of response.data) {
                try {
                    const text = new TextDecoder().decode(chunk).trim();

                    // Skip empty chunks
                    if (!text || text === 'data: [DONE]') continue;

                    // Parse the chunk
                    const lines = text.split('\n').filter(line => line.trim() !== '' && line.startsWith('data: '));

                    for (const line of lines) {
                        const jsonStr = line.replace('data: ', '');
                        if (jsonStr === '[DONE]') {
                            yield { content: '', done: true };
                            return;
                        }

                        const json = JSON.parse(jsonStr);
                        if (json.choices && json.choices[0].delta && json.choices[0].delta.content) {
                            yield {
                                content: json.choices[0].delta.content,
                                done: false,
                            };
                        }
                    }
                } catch (err) {
                    console.error('Error parsing streaming chunk:', err);
                }
            }

            yield { content: '', done: true };
        } catch (error) {
            console.error('Error in streaming response from GLHF:', error);
            yield { content: 'Sorry, I encountered an error while processing your streaming request. Please try again later.', done: true };
        }
    }

    /**
     * Search the internet using SearXNG
     * 
     * @param {string} query - Search query
     * @returns {Promise<string>} Formatted search results
     */
    async searchInternet(query: string): Promise<string> {
        try {
            const results = await searchSearXNG(query, {
                timeRange: 'month',
                maxResults: 5,
            });
            return summarizeSearchResults(results);
        } catch (error) {
            console.error('Error searching internet with GLHF:', error);
            return 'Unable to search the internet at the moment.';
        }
    }
}