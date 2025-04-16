// lib/llm/providers/cohere.ts
// Cohere LLM Provider Implementation

import axios from 'axios';
import { LLMProvider, LLMRequestOptions, LLMResponseChunk, generateSystemPrompt, withRetry } from '../config';
import { searchSearXNG, summarizeSearchResults, optimizeSearchQuery } from '../../search/searxng';
import { env } from '../../env';

export class CohereProvider implements LLMProvider {
    private apiKey: string;
    private baseUrl: string;
    private defaultModel: string;

    constructor(model: string = 'command-r-plus') {
        this.apiKey = env.COHERE_API_KEY;
        this.baseUrl = 'https://api.cohere.ai/v1';
        this.defaultModel = model;

        if (!this.apiKey) {
            console.warn('Cohere API key not found. Cohere provider will not function properly.');
        }
    }

    /**
     * Make a request to the Cohere API
     * 
     * @param {LLMRequestOptions} options - Request options
     * @returns {Promise<any>} API response
     */
    private async makeRequest(options: LLMRequestOptions): Promise<any> {
        const { systemPrompt, messages, temperature = 0.7, maxTokens = 2048, useSearch } = options;

        // Enhanced system prompt with time and memory context
        const enhancedSystemPrompt = systemPrompt || generateSystemPrompt();

        // Convert to the format expected by Cohere API
        // Note: Cohere uses a slightly different format than OpenAI-compatible APIs
        const chatHistory: any[] = [];
        let preamble = enhancedSystemPrompt;

        // Process search results if search is enabled
        if (useSearch && messages.length > 0 && messages[messages.length - 1].role === 'user') {
            const userQuery = messages[messages.length - 1].content;
            const searchQuery = optimizeSearchQuery(userQuery);

            try {
                const searchResults = await this.searchInternet(searchQuery);

                if (searchResults && searchResults.trim() !== 'No search results found.') {
                    // Add search results to the preamble
                    preamble += `\n\nSearch results for "${searchQuery}":\n${searchResults}\n\nPlease use these search results to provide an up-to-date response.`;
                }
            } catch (error) {
                console.error('Error during Cohere search:', error);
                // Continue without search results if search fails
            }
        }

        // Convert messages to Cohere format
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];

            if (msg.role === 'system') {
                // Append system messages to preamble
                preamble += '\n' + msg.content;
            } else {
                // Add user and assistant messages to chat history
                chatHistory.push({
                    role: msg.role,
                    message: msg.content
                });
            }
        }

        // Make the API request
        // Cohere chat endpoint has a different structure
        return await axios.post(
            `${this.baseUrl}/chat`,
            {
                model: this.defaultModel,
                message: messages.length > 0 && messages[messages.length - 1].role === 'user'
                    ? messages[messages.length - 1].content
                    : '',
                chat_history: chatHistory.length > 1 ? chatHistory.slice(0, -1) : [],
                preamble,
                temperature,
                max_tokens: maxTokens,
                stream: options.streamCallback ? true : false,
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Cohere-Version': '2023-05-24'  // Use appropriate version
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

            if (!response.data || !response.data.text) {
                throw new Error('Invalid response format from Cohere API');
            }

            return response.data.text;
        } catch (error) {
            console.error('Error generating response with Cohere:', error);
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

            // Process the stream - Cohere's streaming format is different
            for await (const chunk of response.data) {
                try {
                    const text = new TextDecoder().decode(chunk).trim();

                    // Skip empty chunks
                    if (!text) continue;

                    // Parse the chunk - Cohere uses a different format than OpenAI
                    try {
                        const json = JSON.parse(text);

                        if (json.event_type === 'text-generation') {
                            yield {
                                content: json.text || '',
                                done: false,
                            };
                        } else if (json.event_type === 'stream-end') {
                            yield { content: '', done: true };
                            return;
                        }
                    } catch (parseError) {
                        // If it's not valid JSON, try to extract any text content
                        const match = text.match(/"text"\s*:\s*"([^"]+)"/);
                        if (match && match[1]) {
                            yield {
                                content: match[1],
                                done: false,
                            };
                        }
                    }
                } catch (err) {
                    console.error('Error parsing Cohere streaming chunk:', err);
                }
            }

            yield { content: '', done: true };
        } catch (error) {
            console.error('Error in streaming response from Cohere:', error);
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
            console.error('Error searching internet with Cohere:', error);
            return 'Unable to search the internet at the moment.';
        }
    }
}