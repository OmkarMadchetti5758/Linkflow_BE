const {
  createShortUrl,
  getUrlByShortCode,
  getAllUrls,
  getRedirectUrl,
} = require("../services/url.service");

const {publishClickEvent } = require("../services/analyticsProducer.service")

const SHORT_URL_BASE = (
  process.env.SHORT_URL_BASE || "http://localhost"
).replace(/\/+$/, "");

// GET /api/urls
async function listUrls(req, res, next) {
  try {
    const urls = await getAllUrls();

    return res.status(200).json({
      success: true,
      data: urls.map((url) => ({
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: `${SHORT_URL_BASE}/${url.shortCode}`,
        isActive: url.isActive,
        expiresAt: url.expiresAt,
        createdAt: url.createdAt,
        updatedAt: url.updatedAt,
        clicks: url.clicks,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/urls
async function createUrl(req, res, next) {
  try {
    const { originalUrl } = req.body;

    const url = await createShortUrl(originalUrl);

    return res.status(201).json({
      success: true,
      message: "URL shortened successfully",
      data: {
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: `${SHORT_URL_BASE}/${url.shortCode}`,
        createdAt: url.createdAt,
      },
    });
  } catch (err) {
    if (
      err.message === "URL is required" ||
      err.message === "Please provide a valid URL" ||
      err.message === "Only HTTP and HTTPS URLs are allowed" ||
      err.message === "URL must contain a valid hostname"
    ) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
    next(err);
  }
}

// GET /api/urls/:shortCode
async function getUrlDetails(req, res, next) {
  try {
    const url = await getUrlByShortCode(req.params.shortCode);

    if (!url) {
      return res.status(404).json({
        success: false,
        message: "Short URL not found",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        originalUrl: url.originalUrl,
        shortCode: url.shortCode,
        shortUrl: `${SHORT_URL_BASE}/${url.shortCode}`,
        isActive: url.isActive,
        expiresAt: url.expiresAt,
        createdAt: url.createdAt,
        updatedAt: url.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

// GET /:shortCode
async function redirectUrl(req, res, next) {
  try {
    const { shortCode } = req.params;

    const url = await getRedirectUrl(shortCode);

    if (!url) {
      return res.status(404).json({
        success: false,
        message: "Short URL not found or expired",
      });
    }

    publishClickEvent(url, req).catch((error) => {
      console.error("Failed to publish click event:", error.message);
    });

    return res.redirect(302, url.originalUrl);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listUrls,
  createUrl,
  getUrlDetails,
  redirectUrl,
};
