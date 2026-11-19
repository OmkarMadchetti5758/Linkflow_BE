require("dotenv").config();

const app = require("./app");
const connectMongoDB = require("./config/database");
const { connectRedis } = require("./config/redis");
const { connectKafka, disconnectKafka } = require("./config/kafka");

const PORT = process.env.PORT || 3000;

let server;

async function startServer() {
  try {
    await connectMongoDB();
    await connectRedis();
    await connectKafka();

    server = app.listen(PORT, () => {
      console.log(`LinkFlow API running on port ${PORT}`);
      console.log(`Health endpoint: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error("Application startup failed:", error.message);
    process.exitCode = 1;

    await shutdown();
  }
}

async function shutdown() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = null;
  }

  const { redisClient } = require("./config/redis");
  const mongoose = require("mongoose");

  if (redisClient.isOpen) {
    await redisClient.quit().catch(() => {});
  }

  await disconnectKafka().catch(() => {});
  await mongoose.disconnect().catch(() => {});
}

process.once("SIGINT", () => {
  shutdown().finally(() => process.exit());
});

process.once("SIGTERM", () => {
  shutdown().finally(() => process.exit());
});

startServer();
