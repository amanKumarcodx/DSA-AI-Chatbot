require("dotenv").config();

const app = require("./app.cjs");
const { connectDatabase } = require("./db.cjs");
const { connectRedis } = require("./redis.cjs");

async function startServer() {
  await connectDatabase();
  try {
    await connectRedis();
    console.log("Connected to Redis.");
  } catch {
    console.warn("Redis unavailable; continuing without cache.");
  }

  const port = Number(process.env.PORT || process.env.API_PORT || 3003);
  app.listen(port, () => {
    console.log(`Chat API listening on http://localhost:${port}`);
  });
}

startServer().catch((error) => {
  console.error("Could not start the chat API:", error.message);
  process.exitCode = 1;
});
