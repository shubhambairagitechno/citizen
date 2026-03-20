const mongoose = require("mongoose")

const registrationApprovalSchema = new mongoose.Schema(
  {
    // Application Details
    applicationType: {
      type: String,
      required: true,
      enum: ["citizen", "social_project", "government"],
    },
    applicantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    applicantModel: {
      type: String,
      required: true,
      enum: ["User", "Government", "SocialProjectRegistration"],
    },

    // Approval Workflow
    status: {
      type: String,
      enum: ["pending", "under_review", "approved", "rejected", "requires_info"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    // Review Information
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
    reviewNotes: String,

    // Decision Details
    approvalDecision: {
      type: String,
      enum: ["approved", "rejected", "conditional"],
    },
    rejectionReason: String,
    conditions: [String],

    // Documents and Verification
    documentsSubmitted: [
      {
        documentType: String,
        documentUrl: String,
        uploadedAt: Date,
        verified: {
          type: Boolean,
          default: false,
        },
      },
    ],

    // Communication Log
    communicationLog: [
      {
        message: String,
        sentBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        sentAt: {
          type: Date,
          default: Date.now,
        },
        messageType: {
          type: String,
          enum: ["info_request", "clarification", "decision", "general"],
        },
      },
    ],

    // Metadata
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: Date,

    country: String,
    province: String,
    city: String,
  },
  {
    timestamps: true,
  },
)

// Indexes
registrationApprovalSchema.index({ city: 1, applicationType: 1, status: 1 })
registrationApprovalSchema.index({ reviewedBy: 1 })
registrationApprovalSchema.index({ submittedAt: -1 })

module.exports = mongoose.model("RegistrationApproval", registrationApprovalSchema)
