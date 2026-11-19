const crypto = require("node:crypto");
const { producer } = require("../config/kafka");

const TOPIC = process.env.KAFKA_TOPIC || "url-click-events";

async function publishClickEvent(url, req) {
  const event = {
    eventId: crypto.randomUUID(),
    shortCode: url.shortCode,
    originalUrl: url.originalUrl,
    clickedAt: new Date().toISOString(),
    referrer: req.get("referer") || null,
    userAgent: req.get("user-agent") || null,
  };
  await producer.send({
    topic: TOPIC,
    messages: [
      {
        key: url.shortCode,
        value: JSON.stringify(event),
      },
    ],
  });

  return event.eventId;
}

module.exports = { publishClickEvent };
