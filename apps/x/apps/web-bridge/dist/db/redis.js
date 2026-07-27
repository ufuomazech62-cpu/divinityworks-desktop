/**
 * Redis-backed event bus and session cache for Divinity Works.
 *
 * Replaces the in-memory EmitterSessionBus and userSessionsCache Map.
 * Enables horizontal scaling — multiple server instances can share
 * the same event bus via Redis pub/sub, and the session cache is
 * distributed across instances.
 */
import Redis from 'ioredis';
let publisher = null;
let subscriber = null;
let cacheClient = null;
function parseRedisConfig() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
        try {
            const u = new URL(redisUrl);
            return {
                host: u.hostname,
                port: parseInt(u.port || '6379'),
                maxRetriesPerRequest: null,
                lazyConnect: false,
            };
        }
        catch (e) {
            // fall through
        }
    }
    return {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        maxRetriesPerRequest: null,
        lazyConnect: false,
    };
}
export function getRedisPublisher() {
    if (!publisher) {
        publisher = new Redis(parseRedisConfig());
        publisher.on('error', (err) => console.error('[redis] publisher error:', err.message));
        publisher.on('connect', () => console.log('[redis] publisher connected'));
    }
    return publisher;
}
export function getRedisSubscriber() {
    if (!subscriber) {
        subscriber = new Redis(parseRedisConfig());
        subscriber.on('error', (err) => console.error('[redis] subscriber error:', err.message));
        subscriber.on('connect', () => console.log('[redis] subscriber connected'));
    }
    return subscriber;
}
export function getRedisCache() {
    if (!cacheClient) {
        cacheClient = new Redis(parseRedisConfig());
        cacheClient.on('error', (err) => console.error('[redis] cache error:', err.message));
        cacheClient.on('connect', () => console.log('[redis] cache connected'));
    }
    return cacheClient;
}
// ============================================================================
// RedisEventBus — replaces EmitterSessionBus
// ============================================================================
export class RedisSessionBus {
    userId;
    constructor({ userId }) {
        this.userId = userId;
    }
    publish(event) {
        const pub = getRedisPublisher();
        pub.publish(`session:events:${this.userId}`, JSON.stringify(event));
    }
    subscribe(handler) {
        const sub = getRedisSubscriber();
        const channel = `session:events:${this.userId}`;
        sub.subscribe(channel);
        sub.on('message', (ch, message) => {
            if (ch === channel) {
                try {
                    handler(JSON.parse(message));
                }
                catch (e) {
                    console.error('[redis] session bus parse error:', e);
                }
            }
        });
    }
}
// ============================================================================
// RedisTurnEventHub — replaces TurnEventHub
// ============================================================================
export class RedisTurnEventHub {
    userId;
    constructor({ userId }) {
        this.userId = userId;
    }
    publish(event) {
        const pub = getRedisPublisher();
        pub.publish(`turn:events:${this.userId}`, JSON.stringify(event));
    }
    subscribeAll(handler) {
        const sub = getRedisSubscriber();
        const channel = `turn:events:${this.userId}`;
        sub.subscribe(channel);
        sub.on('message', (ch, message) => {
            if (ch === channel) {
                try {
                    handler(JSON.parse(message));
                }
                catch (e) {
                    console.error('[redis] turn bus parse error:', e);
                }
            }
        });
    }
}
// ============================================================================
// RedisSessionCache — caches session index for fast listing
// ============================================================================
export class RedisSessionCache {
    userId;
    keyPrefix;
    constructor(userId) {
        this.userId = userId;
        this.keyPrefix = `sessions:${userId}`;
    }
    async set(sessionId, entry) {
        const client = getRedisCache();
        await client.hset(this.keyPrefix, sessionId, JSON.stringify(entry));
    }
    async get(sessionId) {
        const client = getRedisCache();
        const val = await client.hget(this.keyPrefix, sessionId);
        return val ? JSON.parse(val) : null;
    }
    async list() {
        const client = getRedisCache();
        const vals = await client.hgetall(this.keyPrefix);
        return Object.values(vals).map((v) => JSON.parse(v));
    }
    async delete(sessionId) {
        const client = getRedisCache();
        await client.hdel(this.keyPrefix, sessionId);
    }
    async clear() {
        const client = getRedisCache();
        await client.del(this.keyPrefix);
    }
}
// ============================================================================
// Health check
// ============================================================================
export async function redisHealthCheck() {
    try {
        const client = getRedisCache();
        const result = await client.ping();
        return result === 'PONG';
    }
    catch {
        return false;
    }
}
// ============================================================================
// Graceful shutdown
// ============================================================================
export async function closeRedis() {
    const promises = [];
    if (publisher)
        promises.push(publisher.quit().then(() => { }));
    if (subscriber)
        promises.push(subscriber.quit().then(() => { }));
    if (cacheClient)
        promises.push(cacheClient.quit().then(() => { }));
    await Promise.all(promises);
    publisher = null;
    subscriber = null;
    cacheClient = null;
}
