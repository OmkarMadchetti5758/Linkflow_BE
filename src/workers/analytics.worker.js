require("dotenv").config();

const { kafka } = require("../config/kafka");
const connectMongoDB = require("../config/database");
const UrlClick = require("../models/UrlClick");
const { parseClickMetadata } = require("../services/clickMetadata.service");

const TOPIC = process.env.KAFKA_TOPIC || "url-click-events";

const consumer = kafka.consumer({
  groupId: "linkflow-analytics-group",
});

async function persistClickEvent(event, clickModel = UrlClick) {
  const metadata = parseClickMetadata(event.userAgent, event.referrer);

  try {
    const result = await clickModel.updateOne(
      { eventId: event.eventId },
      {
        $setOnInsert: {
          eventId: event.eventId,
          shortCode: event.shortCode,
          originalUrl: event.originalUrl,
          clickedAt: new Date(event.clickedAt),
          referrer: typeof event.referrer === "string" ? event.referrer : null,
          userAgent:
            typeof event.userAgent === "string" ? event.userAgent : null,
          ...metadata,
        },
      },
      { upsert: true },
    );

    return result.upsertedCount === 1;
  } catch (error) {
    if (
      error.code === 11000 &&
      (await clickModel.exists({ eventId: event.eventId }))
    ) {
      return false;
    }
    throw error;
  }
}

async function startAnalyticsWorker() {
  try {
    // Connect the worker to MongoDB.
    await connectMongoDB();
    console.log("Analytics worker connected to MongoDB");

    // Connect the Kafka consumer.
    await consumer.connect();
    console.log("Analytics worker connected to Kafka");

    // Subscribe to click events.
    await consumer.subscribe({
      topic: TOPIC,
      fromBeginning: false,
    });

    console.log(`Listening for events on topic: ${TOPIC}`);

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        if (!message.value) {
          return;
        }

        try {
          const event = JSON.parse(message.value.toString());
          const inserted = await persistClickEvent(event);

          console.log(
            `${inserted ? "Click recorded" : "Duplicate click ignored"}: ${event.shortCode} | ` +
              `partition=${partition} | ` +
              `offset=${message.offset}`,
          );
        } catch (error) {
          console.error("Failed to process click event:", error.message);

          // Re-throw so KafkaJS treats the message as failed.
          throw error;
        }
      },
    });
  } catch (error) {
    console.error("Analytics worker failed:", error);
    process.exitCode = 1;
  }
}

async function shutdown() {
  console.log("Shutting down analytics worker...");

  await consumer.disconnect().catch(() => {});

  const mongoose = require("mongoose");
  await mongoose.disconnect().catch(() => {});
}

process.once("SIGINT", () => {
  shutdown().finally(() => process.exit());
});

process.once("SIGTERM", () => {
  shutdown().finally(() => process.exit());
});

if (require.main === module) {
  startAnalyticsWorker();
}

module.exports = { persistClickEvent, startAnalyticsWorker };
