const Bowser = require("bowser");

const UNKNOWN = "Unknown";

function parseClickMetadata(userAgent, referrer) {
  const rawUserAgent = typeof userAgent === "string" ? userAgent.trim() : "";
  let browser = UNKNOWN;
  let operatingSystem = UNKNOWN;
  let deviceType = UNKNOWN;

  if (rawUserAgent) {
    try {
      const { browser: parsedBrowser, os, platform } =
        Bowser.getParser(rawUserAgent).getResult();
      browser = parsedBrowser.name || UNKNOWN;
      operatingSystem = os.name || UNKNOWN;
      deviceType = platform.type
        ? platform.type.charAt(0).toUpperCase() + platform.type.slice(1)
        : UNKNOWN;
    } catch {
      // Invalid user-agent strings are expected input and remain unclassified.
    }
  }

  return {
    browser,
    operatingSystem,
    deviceType,
    referrerDomain: parseReferrerDomain(referrer),
  };
}

function parseReferrerDomain(referrer) {
  if (typeof referrer !== "string" || !referrer.trim()) {
    return "Direct";
  }

  try {
    const url = new URL(referrer.trim());
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      return UNKNOWN;
    }
    return url.hostname.toLowerCase();
  } catch {
    return UNKNOWN;
  }
}

module.exports = { parseClickMetadata, parseReferrerDomain };
