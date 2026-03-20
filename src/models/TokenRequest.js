const mongoose = require("mongoose")

const tokenRequestSchema = new mongoose.Schema(
  {
    // Request ID
    tokenRequestId: {
      type: String,
      unique: true,
      required: true,
    },

    // Requester Information
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Location/City Association (for isolation)
    city: {
      type: String,
      required: true,
    },

    // Proof Documents (image or PDF)
    proofDocuments: [
      {
        filename: String,
        originalName: String,
        fileUrl: String,
        mimetype: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Status and Review
    status: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected"],
      default: "pending",
    },

    // Government Review
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewedAt: Date,

    reviewNotes: String,

    rejectionReason: String,

    issueAmount: {
      type: Number,
      min: 1,
    },

    // Claim status for approved tokens
    claimStatus: {
      type: String,
      enum: ["not_applicable", "pending_claim", "claimed"],
      default: "not_applicable",
    },

    // When the citizen claimed the tokens
    claimedAt: Date,

    // Token Transaction Reference (created on claim, not on approval)
    tokenTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TokenTransaction",
    },

    // Metadata
    metadata: {
      ipAddress: String,
      userAgent: String,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes — { city, status } covers status queries; separate createdAt for time-based sorts
tokenRequestSchema.index({ requestedBy: 1, createdAt: -1 })
tokenRequestSchema.index({ createdAt: -1 })
tokenRequestSchema.index({ reviewedBy: 1, reviewedAt: -1 })
tokenRequestSchema.index({ city: 1, status: 1 })
tokenRequestSchema.index({ requestedBy: 1, claimStatus: 1 })

module.exports = mongoose.model("TokenRequest", tokenRequestSchema)
