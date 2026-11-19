const crypto = require("node:crypto");
const Url = require("../models/Url");
const UrlClick = require("../models/UrlClick");
const { getCachedUrl, cacheUrl } = require("./urlCache.service");

const SHORT_CODE_LENGTH = 7;
const MAX_GENERATION_ATTEMPTS = 5;

function validateUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("URL is required");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(value.trim());
  } catch {
    throw new Error("Please provide a valid URL");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only HTTP and HTTPS URL's are allowed");
  }

  if (!parsedUrl.hostname) {
    throw new Error("URL must contain a valid hostname");
  }

  return parsedUrl.toString();
}

function generateShortCode() {
  return crypto
    .randomBytes(16)
    .toString("base64url")
    .slice(0, SHORT_CODE_LENGTH);
}

async function createShortUrl(originalUrl) {
  const normalizedUrl = validateUrl(originalUrl);

  for (let attempt = 0; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const shortCode = generateShortCode();

    try {
      const url = await Url.create({
        originalUrl: normalizedUrl,
        shortCode,
      });

      return url;
    } catch (error) {
      if (error.code === 11000 && error.keyPattern?.shortCode) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Could not generate a unique short code. Please try again.");
}

async function getUrlByShortCode(shortCode) {
  return Url.findOne({ shortCode });
}

async function getAllUrls() {
  const [urls, clickCounts] = await Promise.all([
    Url.find().sort({ createdAt: -1 }).lean(),
    UrlClick.aggregate([
      {
        $group: {
          _id: "$shortCode",
          clicks: { $sum: 1 },
        },
      },
    ]),
  ]);
  const clicksByShortCode = new Map(
    clickCounts.map(({ _id, clicks }) => [_id, clicks]),
  );

  return urls.map((url) => ({
    ...url,
    clicks: clicksByShortCode.get(url.shortCode) || 0,
  }));
}

async function getRedirectUrl(shortCode) {
  console.log("Short code received:", shortCode);
  console.log("Short code type:", typeof shortCode);
  // 1. Check Redis cache first.
  const cachedUrl = await getCachedUrl(shortCode);

  if (cachedUrl) {
    const isExpired =
      cachedUrl.expiresAt &&
      new Date(cachedUrl.expiresAt).getTime() <= Date.now();

    if (!cachedUrl.isActive || isExpired) {
      return null;
    }

    console.log(`Redis cache HIT: ${shortCode}`);
    return cachedUrl;
  }

  console.log(`Redis cache MISS: ${shortCode}`);

  // 2. Cache miss: query MongoDB.
  const url = await Url.findOne({
    shortCode,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).lean();

  // 3. Return null if the URL doesn't exist or has expired.
  if (!url) {
    return null;
  }

  // 4. Prepare the data required for redirection.
  const cacheData = {
    originalUrl: url.originalUrl,
    shortCode: url.shortCode,
    isActive: url.isActive,
    expiresAt: url.expiresAt,
  };

  // 5. Save the URL in Redis.
  await cacheUrl(shortCode, cacheData);

  // 6. Return the URL for redirection.
  return cacheData;
}

module.exports = {
  createShortUrl,
  getUrlByShortCode,
  getAllUrls,
  getRedirectUrl,
};
