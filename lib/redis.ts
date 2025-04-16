// lib/redis.ts
// Redis client implementation using Vercel KV

import { kv } from '@vercel/kv';

// Export the kv instance directly to be used throughout the application
export { kv };

/**
 * Check if Redis connection is active
 * @returns {Promise<boolean>} True if connection is successful
 */
export async function checkRedisConnection(): Promise<boolean> {
    try {
        // Attempt a simple operation to verify connection
        await kv.ping();
        return true;
    } catch (error) {
        console.error('Redis connection error:', error);
        return false;
    }
}

/**
 * Set a value in Redis with expiration time
 * @param {string} key - The Redis key
 * @param {any} value - Value to store (will be JSON stringified)
 * @param {number} expiryInSeconds - Time in seconds until expiration
 * @returns {Promise<boolean>} Success status
 */
export async function setWithExpiry(key: string, value: any, expiryInSeconds: number): Promise<boolean> {
    try {
        await kv.set(key, JSON.stringify(value), { ex: expiryInSeconds });
        return true;
    } catch (error) {
        console.error(`Failed to set key ${key} in Redis:`, error);
        return false;
    }
}

/**
 * Get and parse a value from Redis
 * @param {string} key - The Redis key
 * @returns {Promise<T | null>} Parsed value or null if not found
 */
export async function getAndParse<T>(key: string): Promise<T | null> {
    try {
        const result = await kv.get(key);
        return result ? JSON.parse(result as string) as T : null;
    } catch (error) {
        console.error(`Failed to get key ${key} from Redis:`, error);
        return null;
    }
}

/**
 * Delete a key from Redis
 * @param {string} key - The Redis key to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteKey(key: string): Promise<boolean> {
    try {
        await kv.del(key);
        return true;
    } catch (error) {
        console.error(`Failed to delete key ${key} from Redis:`, error);
        return false;
    }
}

/**
 * Get multiple keys from Redis
 * @param {string[]} keys - Array of Redis keys
 * @returns {Promise<Record<string, any>>} Object with keys and their values
 */
export async function getMultiple(keys: string[]): Promise<Record<string, any>> {
    try {
        const results = await kv.mget(...keys);
        const response: Record<string, any> = {};

        keys.forEach((key, index) => {
            response[key] = results[index];
        });

        return response;
    } catch (error) {
        console.error(`Failed to get multiple keys from Redis:`, error);
        return {};
    }
}