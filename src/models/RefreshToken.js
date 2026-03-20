const mongoose = require("mongoose")

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Device/session information
    deviceInfo: {
      userAgent: String,
      ip: String,
      deviceType: String, // mobile, desktop, tablet
      browser: String,
      os: String,
    },

    lastUsed: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Index for automatic cleanup of expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
refreshTokenSchema.index({ user: 1 })
// Note: token index is already created via unique:true in the schema field definition

// Static method to cleanup expired tokens
refreshTokenSchema.statics.cleanupExpired = function () {
  return this.deleteMany({
    $or: [{ expiresAt: { $lt: new Date() } }, { isActive: false }],
  })
}

// Static method to revoke all tokens for a user
refreshTokenSchema.statics.revokeAllForUser = function (userId) {
  return this.updateMany({ user: userId }, { isActive: false })
}

module.exports = mongoose.model("RefreshToken", refreshTokenSchema)
