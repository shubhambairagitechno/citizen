const mongoose = require("mongoose")

const allocationLimitSchema = new mongoose.Schema(
  {
    // Reference to the social project registration
    projectRegistration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialProjectRegistration",
      required: true,
    },

    // Reference to the specific project within the registration
    project: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // Maximum tokens a single citizen can spend on this project
    citizenTokenLimit: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
      default: 10,
    },

    // Maximum total tokens the project can receive from all citizens
    projectTokenLimit: {
      type: Number,
      required: true,
      min: 1,
      max: 1000,
      default: 100,
    },

    // Government user who set these limits
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // When the limits were set
    setAt: {
      type: Date,
      default: Date.now,
    },

    // Last updated timestamp
    updatedAt: {
      type: Date,
      default: Date.now,
    },

    // Status of the limits
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Notes about why these limits were set
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for efficient querying
allocationLimitSchema.index({ projectRegistration: 1, project: 1 }, { unique: true })
allocationLimitSchema.index({ project: 1 })
allocationLimitSchema.index({ setBy: 1 })
allocationLimitSchema.index({ projectRegistration: 1, status: 1 })

module.exports = mongoose.model("AllocationLimit", allocationLimitSchema)
