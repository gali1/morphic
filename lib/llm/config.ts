// lib/llm/config.ts
// Base configuration and interfaces for LLM providers

export interface LLMProviderConfig {
    modelName: string;
    provider: string;
    apiKey: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    name?: string;
}

export interface LLMRequestOptions {
    systemPrompt?: string;
    messages: LLMMessage[];
    temperature?: number;
    maxTokens?: number;
    streamCallback?: (chunk: string) => void;
    useSearch?: boolean;
}

export interface LLMResponseChunk {
    content: string;
    done: boolean;
}

export interface LLMProvider {
    generateResponse(options: LLMRequestOptions): Promise<string>;
    generateStreamingResponse(options: LLMRequestOptions): AsyncGenerator<LLMResponseChunk, void, unknown>;
    searchInternet(query: string): Promise<string>;
}

/**
 * Generate a system prompt that includes current time, date, and memory context
 * 
 * @param {string} memory - Optional memory/history to include in the prompt
 * @returns {string} The generated system prompt
 */
export function generateSystemPrompt(memory?: string): string {
    const now = new Date();

    // Format date as "Wednesday, April 16, 2025"
    const formattedDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Format time as "3:45 PM"
    const formattedTime = now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });

    // Base system prompt with time awareness
    let systemPrompt = `You are a helpful AI assistant. The current time is ${formattedTime} on ${formattedDate}.`;

    // Enhanced capabilities description
    systemPrompt += ` You have access to the internet and can search for current information when needed.`;

    // Add memory context if provided
    if (memory && memory.trim()) {
        systemPrompt += `\n\nHere's a summary of our previous conversation that may be relevant to this interaction:\n${memory}`;
    }

    return systemPrompt;
}

/**
 * Retry a function with exponential backoff
 * 
 * @param {Function} fn - The function to retry
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} baseDelay - Base delay in ms between retries
 * @returns {Promise<T>} The function result
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // Calculate exponential backoff delay: baseDelay * 2^attempt
            const delay = baseDelay * Math.pow(2, attempt);
            console.warn(`Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${delay}ms...`);

            // Wait before next attempt
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError || new Error('All retry attempts failed');
}