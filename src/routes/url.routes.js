const express = require("express");

const {
  listUrls,
  createUrl,
  getUrlDetails,
} = require("../controllers/url.controller");
const {
  getAnalytics,
  getBrowserAnalytics,
  getOperatingSystemAnalytics,
  getDeviceAnalytics,
  getReferrerAnalytics,
} = require("../controllers/analytics.controller");
const router = express.Router();

router.get("/", listUrls);
router.post("/", createUrl);
router.get("/:shortCode/analytics", getAnalytics);
router.get("/:shortCode/analytics/browsers", getBrowserAnalytics);
router.get("/:shortCode/analytics/operating-systems", getOperatingSystemAnalytics);
router.get("/:shortCode/analytics/devices", getDeviceAnalytics);
router.get("/:shortCode/analytics/referrers", getReferrerAnalytics);
router.get("/:shortCode", getUrlDetails);

module.exports = router;
