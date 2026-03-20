const mongoose = require("mongoose")

const policySchema = new mongoose.Schema(
  {
    // Policy type: terms_and_conditions or privacy_policy
    policyType: {
      type: String,
      required: [true, "Policy type is required"],
      enum: ["terms_and_conditions", "privacy_policy"],
      unique: true,
    },

    // Rich text content (from CKEditor)
    content: {
      type: String,
      required: [true, "Policy content is required"],
    },

    // Version tracking
    version: {
      type: Number,
      required: true,
      default: 1,
    },

    // Status
    isActive: {
      type: Boolean,
      default: true,
    },

    // Audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Version history
    versionHistory: [
      {
        version: Number,
        content: String,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        updatedAt: {
          type: Date,
          default: Date.now,
        },
        changeNotes: String,
      },
    ],

    // Description for tracking changes
    changeNotes: String,
  },
  {
    timestamps: true,
  },
)

// Indexes for faster queries
// Note: policyType index is already created via unique:true in the schema field definition
policySchema.index({ isActive: 1 })
policySchema.index({ createdAt: -1 })

module.exports = mongoose.model("Policy", policySchema)
