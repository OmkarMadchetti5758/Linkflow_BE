const assert = require("node:assert/strict");
const test = require("node:test");

const Url = require("../src/models/Url");
const UrlClick = require("../src/models/UrlClick");
const { parseClickMetadata } = require("../src/services/clickMetadata.service");
const {
  getAnalyticsDistribution,
  getDateRange,
  getUrlAnalytics,
} = require("../src/services/analytics.service");
const { persistClickEvent } = require("../src/workers/analytics.worker");

const desktopUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

test("parses browser, operating system, device, and a normalized referrer hostname", () => {
  assert.deepEqual(parseClickMetadata(desktopUserAgent, "https://Example.COM/path?q=1"), {
    browser: "Chrome",
    operatingSystem: "Windows",
    deviceType: "Desktop",
    referrerDomain: "example.com",
  });
});

test("normalizes missing and malformed user-agent and referrer values", () => {
  assert.deepEqual(parseClickMetadata(null, null), {
    browser: "Unknown",
    operatingSystem: "Unknown",
    deviceType: "Unknown",
    referrerDomain: "Direct",
  });
  assert.deepEqual(parseClickMetadata("not a real user agent", "not a URL"), {
    browser: "Unknown",
    operatingSystem: "Unknown",
    deviceType: "Unknown",
    referrerDomain: "Unknown",
  });
  assert.equal(parseClickMetadata({}, {}).referrerDomain, "Direct");
});

test("persists normalized click fields and ignores duplicate event IDs", async () => {
  const records = new Map();
  const clickModel = {
    async updateOne(filter, update) {
      if (records.has(filter.eventId)) {
        return { upsertedCount: 0 };
      }
      records.set(filter.eventId, update.$setOnInsert);
      return { upsertedCount: 1 };
    },
    async exists(filter) {
      return records.has(filter.eventId);
    },
  };
  const event = {
    eventId: "event-1",
    shortCode: "abc123_",
    originalUrl: "https://example.com",
    clickedAt: "2026-01-01T12:00:00.000Z",
    userAgent: desktopUserAgent,
    referrer: "https://referrer.example/path",
  };

  assert.equal(await persistClickEvent(event, clickModel), true);
  assert.equal(await persistClickEvent(event, clickModel), false);
  assert.equal(records.size, 1);
  assert.equal(records.get(event.eventId).browser, "Chrome");
  assert.equal(records.get(event.eventId).referrerDomain, "referrer.example");

  const malformedEvent = {
    ...event,
    eventId: "event-2",
    userAgent: {},
    referrer: {},
  };
  assert.equal(await persistClickEvent(malformedEvent, clickModel), true);
  assert.equal(records.get("event-2").userAgent, null);
  assert.equal(records.get("event-2").referrer, null);
  assert.equal(records.get("event-2").browser, "Unknown");
  assert.equal(records.get("event-2").referrerDomain, "Direct");
});

test("validates inclusive UTC date ranges and rejects invalid ranges", () => {
  const range = getDateRange({ from: "2026-02-01", to: "2026-02-03" });
  assert.equal(range.fromDate.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(range.endExclusive.toISOString(), "2026-02-04T00:00:00.000Z");

  assert.throws(
    () => getDateRange({ from: "2026-02-30", to: "2026-03-01" }),
    { statusCode: 400 },
  );
  assert.throws(
    () => getDateRange({ from: "2026-02-02", to: "2026-02-01" }),
    { statusCode: 400 },
  );
});

test("aggregates only matched records and returns counts and percentages", async (t) => {
  const originalFindOne = Url.findOne;
  const originalAggregate = UrlClick.aggregate;
  t.after(() => {
    Url.findOne = originalFindOne;
    UrlClick.aggregate = originalAggregate;
  });

  let pipeline;
  Url.findOne = () => ({
    lean: async () => ({
      shortCode: "abc123_",
      originalUrl: "https://example.com",
    }),
  });
  UrlClick.aggregate = async (value) => {
    pipeline = value;
    return [
      { _id: "Chrome", count: 2 },
      { _id: "Unknown", count: 1 },
    ];
  };

  const result = await getAnalyticsDistribution("abc123_", "browser", {
    from: "2026-02-01",
    to: "2026-02-02",
  });

  assert.equal(result.totalClicks, 3);
  assert.deepEqual(result.distribution, [
    { name: "Chrome", count: 2, percentage: 66.67 },
    { name: "Unknown", count: 1, percentage: 33.33 },
  ]);
  assert.deepEqual(pipeline[0].$match.clickedAt, {
    $gte: new Date("2026-02-01T00:00:00.000Z"),
    $lt: new Date("2026-02-03T00:00:00.000Z"),
  });
  assert.equal(pipeline[1].$group._id.$cond[0].$in[0].$ifNull[0], "$browser");
});

test("supports historical records and keeps raw referrer data out of the response", async (t) => {
  const originalFindOne = Url.findOne;
  const originalCountDocuments = UrlClick.countDocuments;
  const originalAggregate = UrlClick.aggregate;
  const originalFind = UrlClick.find;
  t.after(() => {
    Url.findOne = originalFindOne;
    UrlClick.countDocuments = originalCountDocuments;
    UrlClick.aggregate = originalAggregate;
    UrlClick.find = originalFind;
  });

  Url.findOne = () => ({
    lean: async () => ({
      shortCode: "abc123_",
      originalUrl: "https://example.com",
    }),
  });
  UrlClick.countDocuments = async () => 1;
  UrlClick.aggregate = async () => [
    { date: "2026-02-01", clicks: 1 },
  ];
  UrlClick.find = () => ({
    sort() {
      return this;
    },
    limit() {
      return this;
    },
    select() {
      return this;
    },
    lean: async () => [
      {
        clickedAt: new Date("2026-02-01T10:00:00.000Z"),
        referrer: "https://legacy.example/private/path?token=hidden",
      },
    ],
  });

  const result = await getUrlAnalytics("abc123_", {
    from: "2026-02-01",
    to: "2026-02-01",
  });
  assert.deepEqual(result.recentClicks, [
    {
      clickedAt: new Date("2026-02-01T10:00:00.000Z"),
      referrerDomain: "legacy.example",
    },
  ]);
  assert.equal("referrer" in result.recentClicks[0], false);
  assert.equal("userAgent" in result.recentClicks[0], false);
});

test("returns empty distributions and handles unknown or invalid short codes", async (t) => {
  const originalFindOne = Url.findOne;
  const originalAggregate = UrlClick.aggregate;
  t.after(() => {
    Url.findOne = originalFindOne;
    UrlClick.aggregate = originalAggregate;
  });

  Url.findOne = () => ({ lean: async () => ({ shortCode: "abc123_" }) });
  UrlClick.aggregate = async () => [];
  const emptyResult = await getAnalyticsDistribution(
    "abc123_",
    "deviceType",
    {},
  );
  assert.equal(emptyResult.shortCode, "abc123_");
  assert.match(emptyResult.dateRange.from, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(emptyResult.totalClicks, 0);
  assert.deepEqual(emptyResult.distribution, []);

  Url.findOne = () => ({ lean: async () => null });
  assert.equal(await getAnalyticsDistribution("abc123_", "browser", {}), null);
  await assert.rejects(getAnalyticsDistribution("bad", "browser", {}), {
    statusCode: 400,
  });
});
