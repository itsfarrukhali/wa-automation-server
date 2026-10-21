import Redis from "ioredis";
import { env } from "./env.js";
import logger from "./logger.js";

let redisClient = null;

export const isRedisConfigured = () => Boolean(env.REDIS_URL);

export const getRedisClient = () => {
  if (!isRedisConfigured()) return null;
  if (redisClient) return redisClient;

  redisClient = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      return Math.min(times * 100, 2_000);
    },
  });

  redisClient.on("error", (error) => {
    logger.error("redis_error", { message: error.message });
  });

  return redisClient;
};

export const ensureRedisConnected = async () => {
  const client = getRedisClient();
  if (!client) return null;
  if (client.status === "wait") await client.connect();
  return client;
};

export const pingRedis = async () => {
  const client = await ensureRedisConnected();
  if (!client) return false;
  return (await client.ping()) === "PONG";
};

export const closeRedis = async () => {
  if (!redisClient) return;
  try {
    if (!["wait", "end"].includes(redisClient.status)) {
      await redisClient.quit();
    } else {
      redisClient.disconnect();
    }
  } catch {
    redisClient.disconnect();
  }
  redisClient = null;
};
