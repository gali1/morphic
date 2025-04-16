// lib/llm/factory.ts
// LLM Provider Factory

import { LLMProvider } from './config';
import { GroqProvider } from './providers/groq';
import { GLHFProvider } from './providers/glhf';
import { OpenRouterProvider } from './providers/openrouter';
import { CohereProvider } from './providers/cohere';
import { env } from '../env';

// Map of available model options for each provider
export const providerModels = {
    groq: [
        'llama3-70b-8192',
        'llama3-8b-8192',
        'mixtral-8x7b-32768',
        'gemma-7b-it'
    ],
    glhf: [
        'mixtral-8x7b-32768',
        'mistral-7b-instruct',
        'llama3-70b-8192'
    ],
    openrouter: [
        'anthropic/claude-3-opus',
        'anthropic/claude-3-sonnet',
        'meta-llama/llama-3-70b-instruct',
        'mistralai/mixtral-8x7b-instruct'
    ],
    cohere: [
        'command-r-plus',
        'command-r',
        'command-light'
    ]
};

/**
 * Factory class for creating LLM providers
 */
export class LLMFactory {
    private static providers: Map<string, LLMProvider> = new Map();

    /**
     * Get all available provider names with valid API keys
     * 
     * @returns {string[]} Array of available provider names
     */
    static getAvailableProviders(): string[] {
        return env.getAvailableProviders();
    }

    /**
     * Get all available model options for a specific provider
     * 
     * @param {string} provider - Provider name
     * @returns {string[]} Array of model options
     */
    static getModelsForProvider(provider: string): string[] {
        return providerModels[provider as keyof typeof providerModels] || [];
    }

    /**
     * Create or retrieve a provider instance
     * 
     * @param {string} provider - Provider name
     * @param {string} model - Model name
     * @returns {LLMProvider} Provider instance
     */
    static getProvider(provider: string, model?: string): LLMProvider {
        const providerKey = `${provider}${model ? `-${model}` : ''}`;

        // Return cached provider if exists
        if (this.providers.has(providerKey)) {
            return this.providers.get(providerKey)!;
        }

        let providerInstance: LLMProvider;

        // Create appropriate provider based on name
        switch (provider.toLowerCase()) {
            case 'groq':
                providerInstance = new GroqProvider(model);
                break;
            case 'glhf':
                providerInstance = new GLHFProvider(model);
                break;
            case 'openrouter':
                providerInstance = new OpenRouterProvider(model);
                break;
            case 'cohere':
                providerInstance = new CohereProvider(model);
                break;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        // Cache the provider
        this.providers.set(providerKey, providerInstance);

        return providerInstance;
    }

    /**
     * Get the default provider (first available one)
     * 
     * @returns {LLMProvider | null} Default provider instance or null if none available
     */
    static getDefaultProvider(): LLMProvider | null {
        const availableProviders = this.getAvailableProviders();

        if (availableProviders.length === 0) {
            console.error('No LLM providers available. Check API keys configuration.');
            return null;
        }

        // Return the first available provider
        return this.getProvider(availableProviders[0]);
    }

    /**
     * Create a fallback chain of providers
     * 
     * @param {string[]} providerNames - List of provider names to try in order
     * @returns {LLMProvider[]} Array of provider instances to try
     */
    static createFallbackChain(providerNames?: string[]): LLMProvider[] {
        // Use provided names or all available providers
        const providers = providerNames || this.getAvailableProviders();

        return providers.map(name => this.getProvider(name));
    }
}