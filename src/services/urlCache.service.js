const { redisClient } = require("../config/redis");

const CACHE_PREFIX = "url:";
const DEFAULT_TTL_SECONDS = 60 * 60;

function getCacheKey(shortCode) {
  return `${CACHE_PREFIX}${shortCode}`;
}

// Retrieve a URL from Redis.
async function getCachedUrl(shortCode) {
  try {
    if (typeof shortCode !== "string" || !shortCode.trim()) {
      throw new TypeError("shortCode must be a non-empty string");
    }

    const cacheKey = getCacheKey(shortCode);
    const cachedData = await redisClient.get(cacheKey);

    if (!cachedData) {
      return null;
    }

    return JSON.parse(cachedData);
  } catch (error) {
    console.error("Redis cache read failed:", error.message || error);
    return null;
  }
}

// Store a URL in Redis.
async function cacheUrl(shortCode, urlData) {
  try {
    let ttl = DEFAULT_TTL_SECONDS;

    if (urlData.expiresAt) {
      const remainingSeconds = Math.floor(
        (new Date(urlData.expiresAt).getTime() - Date.now()) / 1000,
      );
      if (remainingSeconds <= 0) {
        return;
      }
      ttl = Math.min(ttl, remainingSeconds);
    }
    await redisClient.set(getCacheKey(shortCode), JSON.stringify(urlData), {
      EX: ttl,
    });
  } catch (error) {
    // A cache write failure must not prevent a valid redirect.
    console.error("Redis cache write failed:", error.message || error);
  }
}

// Delete cached data when a URL changes.
async function invalidateCachedUrl(shortCode) {
  try {
    await redisClient.del(getCacheKey(shortCode));
  } catch (error) {
    console.error("Redis cache invalidation failed:", error.message || error);
  }
}

module.exports = {
  getCachedUrl,
  cacheUrl,
  invalidateCachedUrl,
};