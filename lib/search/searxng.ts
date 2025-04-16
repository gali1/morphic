// lib/search/searxng.ts
// SearXNG search implementation for internet access capability

import axios from 'axios';
import { env } from '../env';

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
    score?: number;
    source?: string;
    date?: string;
}

/**
 * Search the internet using SearXNG
 * 
 * @param {string} query - The search query
 * @param {Object} options - Search options
 * @returns {Promise<SearchResult[]>} Array of search results
 */
export async function searchSearXNG(
    query: string,
    options: {
        timeRange?: 'day' | 'week' | 'month' | 'year';
        maxResults?: number;
        language?: string;
        engines?: string[];
    } = {}
): Promise<SearchResult[]> {
    try {
        const {
            timeRange = 'month',
            maxResults = 5,
            language = 'en',
            engines = ['google', 'bing', 'duckduckgo']
        } = options;

        const searchUrl = env.SEARXNG_URL;

        if (!searchUrl) {
            console.error('SearXNG URL not configured');
            return [];
        }

        // Add current date to time-sensitive queries
        const now = new Date();
        const dateString = now.toISOString().split('T')[0]; // Format: YYYY-MM-DD
        const enhancedQuery = query.includes('latest') || query.includes('recent') || query.includes('today')
            ? `${query} ${dateString}`
            : query;

        const response = await axios.get(searchUrl, {
            params: {
                q: enhancedQuery,
                format: 'json',
                engines: engines.join(','),
                time_range: timeRange,
                language,
                categories: 'general',
                safesearch: 1,
            },
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SearchBot/1.0',
            },
            timeout: 10000, // 10 second timeout
        });

        if (!response.data || !response.data.results) {
            console.error('Invalid SearXNG response:', response.data);
            return [];
        }

        return response.data.results
            .map((result: any) => ({
                title: result.title || 'No title',
                link: result.url || result.link || '',
                snippet: result.content || result.snippet || result.description || '',
                score: result.score,
                source: result.engine,
                date: result.publishedDate || result.published_date || result.date || '',
            }))
            .slice(0, maxResults);
    } catch (error) {
        console.error('SearXNG search error:', error);
        return [];
    }
}

/**
 * Summarizes search results into a readable format for LLM context
 * 
 * @param {SearchResult[]} results - The search results to summarize
 * @returns {string} Formatted summary
 */
export function summarizeSearchResults(results: SearchResult[]): string {
    if (results.length === 0) {
        return "No search results found.";
    }

    const summary = results.map((result, index) => {
        let entry = `[${index + 1}] "${result.title}": ${result.snippet}`;

        if (result.date) {
            entry += ` (Published: ${result.date})`;
        }

        entry += ` Source: ${result.link}`;

        return entry;
    }).join('\n\n');

    return summary;
}

/**
 * Extract relevant keywords from a user query for better search results
 * 
 * @param {string} query - The user's query
 * @returns {string} Optimized search query
 */
export function optimizeSearchQuery(query: string): string {
    // Remove common question phrases
    let optimized = query
        .replace(/^(can you|could you|please|tell me|find|search for|look up|what is|who is|when is|where is|why is|how is)/i, '')
        .trim();

    // Remove other filler words
    optimized = optimized
        .replace(/\b(the|a|an|that|this|these|those|it|they|we|I|you|he|she|about)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Add current year for time-sensitive queries if not present
    const currentYear = new Date().getFullYear();
    if (
        (optimized.includes('latest') ||
            optimized.includes('recent') ||
            optimized.includes('new') ||
            optimized.includes('current')) &&
        !optimized.includes(currentYear.toString())
    ) {
        optimized += ` ${currentYear}`;
    }

    return optimized || query; // Return original if optimization makes it empty
}