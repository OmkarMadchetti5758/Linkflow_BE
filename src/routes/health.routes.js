const express = require("express");
const mongoose = require("mongoose");

const { redisClient } = require("../config/redis");
const { timeStamp } = require("console");

const router = express.Router();

router.get("/", (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  const redisConnected = redisClient.isReady;

  const healthy = mongoConnected && redisConnected;

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    service: "Linkflow API",
    status: healthy ? "healthy" : "degraded",
    dependencies: {
      mongodb: mongoConnected ? "connected" : "disconnected",
      redis: redisConnected ? "connected" : "disconnected",
    },
    timeStamp: new Date().toISOString(),
  });
});

module.exports = router;
