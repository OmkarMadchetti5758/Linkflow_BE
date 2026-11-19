const Url = require("../models/Url");
const UrlClick = require("../models/UrlClick");
const { parseReferrerDomain } = require("./clickMetadata.service");

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{7}$/;

function parseDate(value, fieldName) {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error(`${fieldName} must use YYYY-MM-DD format`);
    error.statusCode = 400;
    throw error;
  }
  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    const error = new Error(`${fieldName} is not a valid date`);
    error.statusCode = 400;
    throw error;
  }
  return date;
}

function getDateRange(query = {}) {
  const now = new Date();
  const defaultTo = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const defaultFrom = new Date(
    defaultTo.getTime() - (DEFAULT_DAYS - 1) * DAY_IN_MS,
  );
  const fromDate = parseDate(query.from, "from") || defaultFrom;
  const toDate = parseDate(query.to, "to") || defaultTo;

  if (fromDate > toDate) {
    const error = new Error(
      "'from' date must be earlier than or equal to 'to' date",
    );
    error.statusCode = 400;
    throw error;
  }

  const rangeDays = (toDate.getTime() - fromDate.getTime()) / DAY_IN_MS + 1;
  if (rangeDays > MAX_RANGE_DAYS) {
    const error = new Error(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
    error.statusCode = 400;
    throw error;
  }

  return {
    fromDate,
    toDate,
    endExclusive: new Date(toDate.getTime() + DAY_IN_MS),
  };
}

function validateShortCode(shortCode) {
  if (typeof shortCode !== "string" || !SHORT_CODE_PATTERN.test(shortCode)) {
    const error = new Error("Short code must be a 7-character URL-safe string");
    error.statusCode = 400;
    throw error;
  }
}

async function getAnalyticsContext(shortCode, query) {
  validateShortCode(shortCode);
  const range = getDateRange(query);
  const url = await Url.findOne({ shortCode }).lean();

  if (!url) {
    return null;
  }

  return {
    url,
    dateRange: {
      from: range.fromDate.toISOString().slice(0, 10),
      to: range.toDate.toISOString().slice(0, 10),
      timezone: "UTC",
    },
    rangeFilter: {
      shortCode,
      clickedAt: {
        $gte: range.fromDate,
        $lt: range.endExclusive,
      },
    },
  };
}

async function getUrlAnalytics(shortCode, query = {}) {
  const context = await getAnalyticsContext(shortCode, query);
  if (!context) {
    return null;
  }

  const { url, dateRange, rangeFilter } = context;
  const [totalClicks, clicksInRange, dailyClicks, recentClickRecords] =
    await Promise.all([
      UrlClick.countDocuments({ shortCode }),
      UrlClick.countDocuments(rangeFilter),
      UrlClick.aggregate([
        { $match: rangeFilter },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$clickedAt",
                timezone: "UTC",
              },
            },
            clicks: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: "$_id",
            clicks: 1,
          },
        },
      ]),
      UrlClick.find(rangeFilter)
        .sort({ clickedAt: -1 })
        .limit(10)
        .select("clickedAt referrer referrerDomain -_id")
        .lean(),
    ]);
  const recentClicks = recentClickRecords.map(
    ({ clickedAt, referrer, referrerDomain }) => ({
      clickedAt,
      referrerDomain: referrerDomain || parseReferrerDomain(referrer),
    }),
  );

  const clicksByDate = new Map(
    dailyClicks.map((item) => [item.date, item.clicks]),
  );
  const completeDailyClicks = [];

  for (
    let timestamp = new Date(`${dateRange.from}T00:00:00.000Z`).getTime();
    timestamp < new Date(`${dateRange.to}T00:00:00.000Z`).getTime() + DAY_IN_MS;
    timestamp += DAY_IN_MS
  ) {
    const date = new Date(timestamp).toISOString().slice(0, 10);
    completeDailyClicks.push({
      date,
      clicks: clicksByDate.get(date) || 0,
    });
  }

  return {
    shortCode,
    originalUrl: url.originalUrl,
    totalClicks,
    clicksInRange,
    dateRange,
    dailyClicks: completeDailyClicks,
    recentClicks,
  };
}

async function getAnalyticsDistribution(shortCode, field, query = {}) {
  const validFields = new Set([
    "browser",
    "operatingSystem",
    "deviceType",
    "referrerDomain",
  ]);
  if (!validFields.has(field)) {
    throw new Error("Unsupported analytics distribution");
  }

  const context = await getAnalyticsContext(shortCode, query);
  if (!context) {
    return null;
  }

  const groupedClicks = await UrlClick.aggregate([
    { $match: context.rangeFilter },
    {
      $group: {
        _id: {
          $cond: [
            {
              $in: [
                { $ifNull: [`$${field}`, ""] },
                ["", null],
              ],
            },
            "Unknown",
            `$${field}`,
          ],
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1, _id: 1 } },
  ]);

  const totalClicks = groupedClicks.reduce(
    (total, category) => total + category.count,
    0,
  );

  return {
    shortCode,
    dateRange: context.dateRange,
    totalClicks,
    distribution: groupedClicks.map(({ _id, count }) => ({
      name: _id,
      count,
      percentage:
        totalClicks === 0
          ? 0
          : Math.round((count / totalClicks) * 10000) / 100,
    })),
  };
}

module.exports = {
  getAnalyticsDistribution,
  getDateRange,
  getUrlAnalytics,
};
