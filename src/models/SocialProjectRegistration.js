const mongoose = require("mongoose")

const socialProjectRegistrationSchema = new mongoose.Schema(
  {
    // Reference to the user who registered
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Project/Organization Details (from registration screen)
    projectOrganizationName: {
      type: String,
      required: true,
      trim: true,
    },

    state: {
      type: String,
      required: true,
      trim: true,
    },

    // Allowed Project Types (what types can this user create)
    allowedProjectTypes: [
      {
        type: String,
        enum: [
          "Infrastructure",
          "Environment",
          "Education",
          "Healthcare",
          "Social Welfare",
          "Technology",
          "Community Development",
          "Arts & Culture",
          "Sports & Recreation",
          "Other",
        ],
      },
    ],

    // Location Information
    city: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      required: true,
      trim: true,
    },

    // Responsible Person Details
    responsiblePersonFullName: {
      type: String,
      required: true,
      trim: true,
    },

    personPositionRole: {
      type: String,
      required: true,
      trim: true,
    },

    // Contact Information
    contactNumber: {
      type: String,
      required: true,
      trim: true,
    },

    emailAddress: {
      type: String,
      required: true,
      lowercase: true,
    },

    // Documents
    documents: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Registration Notes
    registrationNotes: {
      type: String,
      trim: true,
    },

    // Registration Status — must be approved by government before user can create projects
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // Approval Information
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: Date,

    rejectionReason: String,

    projects: [
      {
        projectTitle: {
          type: String,
          required: true,
          trim: true,
        },
        projectType: {
          type: String,
          required: true,
          enum: [
            "Infrastructure",
            "Environment",
            "Education",
            "Healthcare",
            "Social Welfare",
            "Technology",
            "Community Development",
            "Arts & Culture",
            "Sports & Recreation",
            "Other",
          ],
        },
        state: {
          type: String,
          trim: true,
        },
        city: String,
        country: String,
        projectDescription: String,
        startDate: {
          type: Date,
          required: true,
        },
        endDate: {
          type: Date,
          required: true,
        },
        contactInfo: {
          representativeName: String,
          email: String,
        },
        documentation: [
          {
            fileName: String,
            fileUrl: String,
            fileType: String,
            uploadedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        fundingGoal: {
          type: Number,
          default: 0,
          min: 0,
        },
        allocationSet: {
          type: Boolean,
          default: false,
        },
        tokensFunded: {
          type: Number,
          default: 0,
          min: 0,
        },
        supportedBy: [
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            tokensSpent: Number,
            supportedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        projectStatus: {
          type: String,
          enum: ["pending_approval", "active", "inactive", "completed", "rejected"],
          default: "pending_approval",
        },
        approvedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        approvedAt: Date,
        rejectionReason: String,
        publishedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Timestamps
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes — { city, status } compound covers status-only queries as prefix; no standalone needed
socialProjectRegistrationSchema.index({ user: 1 })
socialProjectRegistrationSchema.index({ submittedAt: -1 })
socialProjectRegistrationSchema.index({ city: 1, status: 1 })

module.exports = mongoose.model("SocialProjectRegistration", socialProjectRegistrationSchema)
