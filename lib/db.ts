// lib/db.ts
// PostgreSQL database configuration using Prisma

import { PrismaClient } from '@prisma/client';

/**
 * Create a PrismaClient singleton
 * Uses the POSTGRES_PRISMA_URL with pgbouncer configuration
 */
const prismaClientSingleton = () => {
    return new PrismaClient({
        datasources: {
            db: {
                url: process.env.POSTGRES_PRISMA_URL,
            },
        },
        log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
};

// Global type declaration for PrismaClient
declare global {
    var prisma: undefined | ReturnType<typeof prismaClientSingleton>;
}

// Use existing Prisma instance or create new one
const prisma = globalThis.prisma ?? prismaClientSingleton();

export default prisma;

// For development, save prisma client to global to prevent multiple instances during hot reloading
if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma;

/**
 * Check database connection and attempt fallback connections if primary fails
 * @returns {Promise<boolean>} True if connection is successful
 */
export async function checkDatabaseConnection(): Promise<boolean> {
    try {
        // Try primary connection
        await prisma.$queryRaw`SELECT 1`;
        return true;
    } catch (error) {
        console.error('Primary database connection error:', error);

        // Attempt fallback to non-pooling URL
        try {
            const fallbackPrisma = new PrismaClient({
                datasources: {
                    db: {
                        url: process.env.POSTGRES_URL_NON_POOLING,
                    },
                },
            });

            await fallbackPrisma.$queryRaw`SELECT 1`;
            console.log('Connected using non-pooling URL');
            return true;
        } catch (fallbackError) {
            console.error('Non-pooling fallback connection failed:', fallbackError);

            // Attempt fallback to no-SSL URL
            try {
                const noSslPrisma = new PrismaClient({
                    datasources: {
                        db: {
                            url: process.env.POSTGRES_URL_NO_SSL,
                        },
                    },
                });

                await noSslPrisma.$queryRaw`SELECT 1`;
                console.log('Connected using no-SSL URL');
                return true;
            } catch (noSslError) {
                console.error('No-SSL fallback connection also failed:', noSslError);
                return false;
            }
        }
    }
}

/**
 * Get the appropriate database URL for different connection scenarios
 * @param {string} purpose - The connection purpose: 'default', 'prisma', 'noSSL', or 'nonPooling'
 * @returns {string} The appropriate database URL
 */
export function getDatabaseUrl(purpose: 'default' | 'prisma' | 'noSSL' | 'nonPooling'): string {
    switch (purpose) {
        case 'default':
            return process.env.POSTGRES_URL || '';
        case 'prisma':
            return process.env.POSTGRES_PRISMA_URL || '';
        case 'noSSL':
            return process.env.POSTGRES_URL_NO_SSL || '';
        case 'nonPooling':
            return process.env.POSTGRES_URL_NON_POOLING || '';
        default:
            return process.env.POSTGRES_URL || '';
    }
}

/**
 * Build a direct connection string from component parts
 * Useful when individual credentials are available but not a full connection string
 * @returns {string} PostgreSQL connection string
 */
export function buildConnectionString(): string {
    const {
        POSTGRES_USER,
        POSTGRES_PASSWORD,
        POSTGRES_HOST,
        POSTGRES_DATABASE
    } = process.env;

    if (!POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_HOST || !POSTGRES_DATABASE) {
        console.warn('Missing PostgreSQL credentials, cannot build connection string');
        return '';
    }

    return `postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}/${POSTGRES_DATABASE}`;
}