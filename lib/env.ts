// lib/env.ts
// Centralized environment variable management

export const env = {
    // LLM API Keys
    GROQ_API_KEY: process.env.NEXT_PUBLIC_GROQ_API_KEY || '',
    GLHF_API_KEY: process.env.NEXT_PUBLIC_GLHF_API_KEY || '',
    OPENROUTER_API_KEY: process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || '',
    COHERE_API_KEY: process.env.NEXT_PUBLIC_COHERE_API_KEY || '',

    // Redis Config (Vercel KV)
    REDIS_URL: process.env.KV_URL || '',
    REDIS_REST_API_URL: process.env.KV_REST_API_URL || '',
    REDIS_REST_API_TOKEN: process.env.KV_REST_API_TOKEN || '',
    REDIS_REST_API_READ_ONLY_TOKEN: process.env.KV_REST_API_READ_ONLY_TOKEN || '',

    // PostgreSQL Config
    POSTGRES_URL: process.env.POSTGRES_URL || '',
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL || '',
    POSTGRES_URL_NO_SSL: process.env.POSTGRES_URL_NO_SSL || '',
    POSTGRES_URL_NON_POOLING: process.env.POSTGRES_URL_NON_POOLING || '',
    POSTGRES_USER: process.env.POSTGRES_USER || '',
    POSTGRES_HOST: process.env.POSTGRES_HOST || '',
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || '',
    POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || '',

    // SearXNG Config
    SEARXNG_URL: process.env.SEARXNG_URL || 'https://searx.be/search',

    // Application Config
    APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    NODE_ENV: process.env.NODE_ENV || 'development',

    // Helper functions
    isProduction(): boolean {
        return this.NODE_ENV === 'production';
    },

    isDevelopment(): boolean {
        return this.NODE_ENV === 'development';
    },

    /**
     * Validate that all required environment variables are set
     * @returns {boolean} True if all required variables are set
     */
    validate(): boolean {
        const requiredVars = [
            'REDIS_URL',
            'REDIS_REST_API_TOKEN',
            'POSTGRES_URL',
            'POSTGRES_PRISMA_URL',
        ];

        const missingVars = requiredVars.filter(varName => {
            const key = varName as keyof typeof env;
            return !this[key] || this[key] === '';
        });

        if (missingVars.length > 0) {
            console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
            return false;
        }

        return true;
    },

    /**
     * Get which LLM providers are available based on API keys
     * @returns {string[]} Array of available provider names
     */
    getAvailableProviders(): string[] {
        const providers = [];

        if (this.GROQ_API_KEY) providers.push('groq');
        if (this.GLHF_API_KEY) providers.push('glhf');
        if (this.OPENROUTER_API_KEY) providers.push('openrouter');
        if (this.COHERE_API_KEY) providers.push('cohere');

        return providers;
    }
};