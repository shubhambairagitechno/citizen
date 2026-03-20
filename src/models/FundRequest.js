const mongoose = require("mongoose")

const fundRequestSchema = new mongoose.Schema(
  {
    // Request ID
    fundRequestId: {
      type: String,
      unique: true,
      required: true,
    },

    // Social Project Information
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialProjectRegistration",
      required: true,
    },

    // Requester (Project Owner)
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Location/City Association
    city: {
      type: String,
      required: true,
    },

    // Fund Request Details
    tokenAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    requestedFiatAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    fiatCurrency: {
      type: String,
      default: "ARS",
    },

    // Bank Details for Transfer
    bankDetails: {
      bankName: String,
      accountHolder: String,
      accountNumber: String,
      accountType: String,
      routingNumber: String,
      swiftCode: String,
    },

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

    // Bank Transfer Proof
    bankTransferProof: {
      filename: String,
      originalName: String,
      fileUrl: String,
      mimetype: String,
      uploadedAt: Date,
    },

    // Token Transaction Reference
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

// Indexes — { city, status } and { requestedBy, status } cover all status-based queries
fundRequestSchema.index({ projectId: 1, createdAt: -1 })
fundRequestSchema.index({ requestedBy: 1, status: 1 })
fundRequestSchema.index({ reviewedBy: 1, reviewedAt: -1 })
fundRequestSchema.index({ city: 1, status: 1 })

module.exports = mongoose.model("FundRequest", fundRequestSchema)
