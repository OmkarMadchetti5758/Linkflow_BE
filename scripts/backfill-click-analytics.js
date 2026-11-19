require("dotenv").config();

const mongoose = require("mongoose");
const connectMongoDB = require("../src/config/database");
const { parseClickMetadata } = require("../src/services/clickMetadata.service");
const UrlClick = require("../src/models/UrlClick");

const BATCH_SIZE = 500;
const NORMALIZED_FIELDS = [
  "browser",
  "operatingSystem",
  "deviceType",
  "referrerDomain",
];
const MISSING_VALUES = [null, ""];

function isMissing(value) {
  return value === undefined || value === null || value === "";
}

async function backfillClickAnalytics() {
  await connectMongoDB();

  const missingFieldFilters = NORMALIZED_FIELDS.flatMap((field) => [
    { [field]: { $exists: false } },
    { [field]: null },
    { [field]: "" },
  ]);
  const cursor = UrlClick.collection
    .find(
      { $or: missingFieldFilters },
      {
        projection: {
          _id: 1,
          userAgent: 1,
          referrer: 1,
          ...Object.fromEntries(NORMALIZED_FIELDS.map((field) => [field, 1])),
        },
      },
    )
    .batchSize(BATCH_SIZE);

  let operations = [];
  let updatedRecords = 0;

  async function flushOperations() {
    if (operations.length === 0) {
      return;
    }
    const result = await UrlClick.collection.bulkWrite(operations, {
      ordered: false,
    });
    updatedRecords += result.modifiedCount;
    operations = [];
  }

  for await (const click of cursor) {
    const metadata = parseClickMetadata(click.userAgent, click.referrer);

    for (const field of NORMALIZED_FIELDS) {
      if (isMissing(click[field])) {
        operations.push({
          updateOne: {
            filter: {
              _id: click._id,
              [field]: { $in: MISSING_VALUES },
            },
            update: { $set: { [field]: metadata[field] } },
          },
        });
      }
    }

    if (operations.length >= BATCH_SIZE) {
      await flushOperations();
    }
  }

  await flushOperations();
  return updatedRecords;
}

if (require.main === module) {
  backfillClickAnalytics()
    .then((updatedRecords) => {
      console.log(`Backfill complete. Updated ${updatedRecords} click records.`);
    })
    .catch((error) => {
      console.error("Click analytics backfill failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect();
    });
}

module.exports = { backfillClickAnalytics };
