const mongoose = require("mongoose")

const governmentSchema = new mongoose.Schema(
  {
    // Basic Information
    governmentName: {
      type: String,
      required: true,
      trim: true,
    },
    entityType: {
      type: String,
      required: true,
      enum: ["Municipal", "Provincial", "Federal", "Regional", "District", "County"],
    },

    // Location Information
    country: {
      type: String,
      required: true,
    },
    province: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },

    // Contact Information
    representativeName: {
      type: String,
      required: true,
    },
    representativeRole: {
      type: String,
      required: true,
    },
    institutionalEmail: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    officialWebsite: {
      type: String,
      validate: {
        validator: (v) => /^https?:\/\/.+/.test(v),
        message: "Please enter a valid URL",
      },
    },

    // Administrative Details
    registrationNumber: {
      type: String,
      unique: true,
    },
    establishedDate: Date,
    jurisdiction: {
      type: String,
      // was required: true, now optional to match UI
    },

    // Associated User Account
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // was required: true, now optional because user is created after superadmin approval
      required: false,
    },

    // Administrative Permissions
    permissions: [
      {
        type: String,
        enum: [
          "approve_citizens",
          "approve_projects",
          "manage_tokens",
          "view_analytics",
          "manage_ecosystem",
          "set_policies",
          "generate_reports",
        ],
      },
    ],

    // Token Management Settings
    tokenAllocationLimits: {
      citizenLimit: {
        type: Number,
        default: 100,
      },
      projectLimit: {
        type: Number,
        default: 1000,
      },
      dailyIssuanceLimit: {
        type: Number,
        default: 10000,
      },
    },

    // Status and Verification
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "verified", "rejected"],
      default: "unverified",
    },
    isSuperAdminVerified: {
      type: Boolean,
      default: false,
    },

    consentContactBeforeActivation: {
      type: Boolean,
      default: false,
    },
    acceptedTermsAndConditions: {
      type: Boolean,
      default: false,
    },

    comments: String,
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: Date,
    rejectionReason: String,
  },
  {
    timestamps: true,
  },
)

// Indexes
governmentSchema.index({ governmentName: 1, entityType: 1 })
governmentSchema.index({ country: 1, province: 1, city: 1 })
governmentSchema.index({ city: 1, status: 1 })

module.exports = mongoose.model("government", governmentSchema)
