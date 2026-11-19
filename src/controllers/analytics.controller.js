const {
  getAnalyticsDistribution,
  getUrlAnalytics,
} = require("../services/analytics.service");

const distributionFields = {
  browsers: "browser",
  "operating-systems": "operatingSystem",
  devices: "deviceType",
  referrers: "referrerDomain",
};

async function getAnalytics(req, res, next) {
  try {
    const analytics = await getUrlAnalytics(req.params.shortCode, req.query);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        message: "Short URL not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    return next(error);
  }
}

function createDistributionController(distribution) {
  return async function getDistribution(req, res, next) {
    try {
      const analytics = await getAnalyticsDistribution(
        req.params.shortCode,
        distributionFields[distribution],
        req.query,
      );

      if (!analytics) {
        return res.status(404).json({
          success: false,
          message: "Short URL not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      return next(error);
    }
  };
}

module.exports = {
  getBrowserAnalytics: createDistributionController("browsers"),
  getDeviceAnalytics: createDistributionController("devices"),
  getAnalytics,
  getOperatingSystemAnalytics: createDistributionController("operating-systems"),
  getReferrerAnalytics: createDistributionController("referrers"),
};
