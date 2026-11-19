const { Kafka } = require("kafkajs");

const brokers = (process.env.KAFKA_BROKERS || "localhost:9092")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || "linkflow-api",
  brokers,
});

const producer = kafka.producer();

async function connectKafka() {
  await producer.connect();
  console.log("Kafka producer connected successfully");
}

async function disconnectKafka() {
  await producer.disconnect();
}

module.exports = {
  kafka,
  producer,
  connectKafka,
  disconnectKafka,
};
