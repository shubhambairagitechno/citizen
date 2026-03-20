const mongoose = require("mongoose")

const tokenClaimSchema = new mongoose.Schema(
  {
    // Claim Details
    claimId: {
      type: String,
      unique: true,
      required: true,
    },

    // Claimant Information
    claimant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Payment Information
    paymentType: {
      type: String,
      required: true,
      enum: ["property_tax", "utility_bill", "municipal_fee", "other"],
    },
    paymentAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentCurrency: {
      type: String,
      default: "ARS",
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    paymentReference: String, // Receipt number, transaction ID, etc.

    // Token Calculation
    tokenRate: {
      type: Number,
      default: 100, // 1 token per 100 ARS by default
    },
    calculatedTokens: {
      type: Number,
      required: true,
    },

    // Proof Documents
    proofDocuments: [
      {
        filename: String,
        originalName: String,
        mimetype: String,
        size: Number,
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

    // Token Transaction Reference
    tokenTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TokenTransaction",
    },

    // Additional Information
    description: String,
    metadata: {
      ipAddress: String,
      userAgent: String,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes
tokenClaimSchema.index({ claimant: 1, createdAt: -1 })
tokenClaimSchema.index({ claimant: 1, status: 1 })
tokenClaimSchema.index({ reviewedBy: 1, reviewedAt: -1 })
tokenClaimSchema.index({ paymentType: 1 })

// Calculate tokens based on payment amount and rate
tokenClaimSchema.pre("save", function (next) {
  if (this.isModified("paymentAmount") || this.isModified("tokenRate")) {
    this.calculatedTokens = Math.floor(this.paymentAmount / this.tokenRate)
  }
  next()
})

module.exports = mongoose.model("TokenClaim", tokenClaimSchema)
