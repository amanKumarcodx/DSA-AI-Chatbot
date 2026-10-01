const { createClient } = require("redis");

let redisErrorReported = false;

const redis = createClient({
  url: process.env.REDIS_URL,
  socket: {
    connectTimeout: 5000,
    reconnectStrategy(retries) {
      return Math.min(250 * 2 ** retries, 30000);
    },
  },
});

redis.on("error", (error) => {
  if (!redisErrorReported) {
    console.error("Redis connection error:", error.code || error.name);
    redisErrorReported = true;
  }
});

redis.on("ready", () => {
  if (redisErrorReported) console.log("Redis connection restored.");
  redisErrorReported = false;
});

async function connectRedis() {
  if (!redis.isOpen) await redis.connect();
}

module.exports = { redis, connectRedis };