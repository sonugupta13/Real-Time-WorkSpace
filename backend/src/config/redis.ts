import Redis, { RedisOptions } from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

// Main Redis Client for Response Caching
export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  retryStrategy(times) {
    if (times > 5) return null; // Stop retrying if Redis is unavailable
    return Math.min(times * 300, 2000);
  },
});

redis.on("connect", () => {
  console.log("[Redis Cache] Connected to Redis server.");
});

redis.on("error", (err) => {
  // Graceful degradation log
  console.warn(`[Redis Cache] Notice: ${err.message}. Gracefully falling back to DB.`);
});

// Redis connection options required by BullMQ
export function getBullMQConnectionOptions(): any {
  try {
    const url = new URL(redisUrl);
    return {
      host: url.hostname || "localhost",
      port: parseInt(url.port || "6379", 10),
      username: url.username || undefined,
      password: url.password || undefined,
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    };
  } catch {
    return {
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }
}

// --------------------------------------------------------
// Cache Utilities with Graceful Fallback
// --------------------------------------------------------

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      return null;
    }
    const data = await redis.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch {
    // If Redis is offline or errors, gracefully return null (triggers DB fallback)
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds = 300): Promise<void> {
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      return;
    }
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Graceful no-op on failure
  }
}

export async function invalidateCache(key: string): Promise<void> {
  try {
    if (redis.status !== "ready" && redis.status !== "connecting") {
      return;
    }
    await redis.del(key);
  } catch {
    // Graceful no-op on failure
  }
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const ping = await redis.ping();
    return ping === "PONG";
  } catch {
    return false;
  }
}

export default redis;
