const mongoose = require("mongoose");

const urlClickSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },

    shortCode: {
      type: String,
      required: true,
      index: true,
    },

    originalUrl: {
      type: String,
      required: true,
    },

    clickedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    referrer: {
      type: String,
      default: null,
    },

    userAgent: {
      type: String,
      default: null,
    },

    browser: {
      type: String,
      default: "Unknown",
    },

    operatingSystem: {
      type: String,
      default: "Unknown",
    },

    deviceType: {
      type: String,
      default: "Unknown",
    },

    referrerDomain: {
      type: String,
      default: "Direct",
    },

    ipAddress: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Efficiently retrieve clicks for a short URL in chronological order.
urlClickSchema.index({ shortCode: 1, clickedAt: -1 });

module.exports = mongoose.model("UrlClick", urlClickSchema);