const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      maxlength: [100, "Full name cannot exceed 100 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"],
    },

    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false, // Don't include password in queries by default
    },

    // User Type (from registration screen)
    userType: {
      type: String,
      required: [true, "User type is required"],
      enum: {
        values: ["citizen", "social_project", "government"],
        message: "User type must be one of: citizen, social_project, government",
      },
    },

    // Profile Information
    avatar: {
      public_id: String,
      url: String,
    },

    phoneNumber: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s-()]+$/, "Please provide a valid phone number"],
    },
    role: {
      type: String,
      default: "user",
      enum: ["user", "superadmin", "admin", "staff"],
    },
    // Location Information (from registration form)
    country: {
      type: String,
      trim: true,
    },

    province: {
      type: String,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // Approval status for token operations (does not affect visibility)
    approvalStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    approvalStatusUpdatedAt: Date,

    approvalStatusUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Superadmin gate for government users
    isSuperAdminVerified: {
      type: Boolean,
      default: false,
    },

    // Email Verification - Changed from token to OTP system
    emailVerificationOTP: String,
    emailVerificationExpire: Date,

    // Password Reset - Changed from token to OTP system
    resetPasswordOTP: String,
    resetPasswordExpire: Date,

    resetPasswordToken: String,
    resetPasswordTokenExpire: Date,

    tokenBalance: {
      type: Number,
      default: 0,
      min: 0,
    },

    tokenSupportedProjects: [
      {
        project: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Project",
        },
        tokensSpent: {
          type: Number,
          min: 0,
        },
        supportedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Settings and Preferences
    settings: {
      notifications: {
        email: {
          type: Boolean,
          default: true,
        },
        push: {
          type: Boolean,
          default: true,
        },
        projectUpdates: {
          type: Boolean,
          default: true,
        },
        newsletter: {
          type: Boolean,
          default: false,
        },
      },
      privacy: {
        profileVisibility: {
          type: String,
          enum: ["public", "private", "friends"],
          default: "public",
        },
        showEmail: {
          type: Boolean,
          default: false,
        },
        showPhone: {
          type: Boolean,
          default: false,
        },
      },
      language: {
        type: String,
        default: "en",
      },
      timezone: {
        type: String,
        default: "UTC",
      },
    },

    // Terms and Privacy Agreement
    agreedToTerms: {
      type: Boolean,
      required: [true, "You must agree to terms and conditions"],
      default: false,
    },

    agreedToPrivacy: {
      type: Boolean,
      required: [true, "You must agree to privacy policy"],
      default: false,
    },

    termsAgreedAt: Date,
    privacyAgreedAt: Date,

    // Login tracking
    lastLogin: Date,
    loginCount: {
      type: Number,
      default: 0,
    },

    isRegistrationProjectDone: {
      type: Boolean,
      default: false,
    },

    // Account creation tracking
    registrationIP: String,
    lastLoginIP: String,
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

// Indexes for better query performance
// Note: email and username indexes are already created via unique:true in the schema field definitions
// Note: approvalStatus standalone index removed — covered by the compound { city, approvalStatus } index
userSchema.index({ userType: 1 })
userSchema.index({ isActive: 1 })
userSchema.index({ isSuperAdminVerified: 1 })
userSchema.index({ isRegistrationProjectDone: 1 })
userSchema.index({ createdAt: -1 })
userSchema.index({ city: 1, approvalStatus: 1 })

// Virtual for user's full profile URL
userSchema.virtual("profileUrl").get(function () {
  return `${process.env.FRONTEND_URL}/profile/${this.username}`
})

userSchema.methods.toJSON = function () {
  const userObject = this.toObject()

  // Remove sensitive fields from JSON output
  delete userObject.password
  delete userObject.emailVerificationOTP
  delete userObject.emailVerificationExpire
  delete userObject.resetPasswordOTP
  delete userObject.resetPasswordExpire
  delete userObject.resetPasswordToken
  delete userObject.resetPasswordTokenExpire
  delete userObject.__v

  return userObject
}

// Hash password before saving
userSchema.pre("save", async function (next) {
  // Only hash password if it's been modified
  if (!this.isModified("password")) {
    return next()
  }

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// Set agreement timestamps
userSchema.pre("save", function (next) {
  if (this.isNew && this.agreedToTerms) {
    this.termsAgreedAt = new Date()
  }
  if (this.isNew && this.agreedToPrivacy) {
    this.privacyAgreedAt = new Date()
  }
  next()
})

// Instance method to check password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

// Generate JWT token
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    {
      id: this._id,
      userType: this.userType,
      email: this.email,
      role: this.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE },
  )
}

// Generate refresh token
userSchema.methods.getRefreshToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE })
}

// Generate email verification OTP - Replaced token method with OTP method
userSchema.methods.getEmailVerificationOTP = function () {
  // Generate 6-digit OTP
  const otp = "999999"
  // const otp = Math.floor(100000 + Math.random() * 900000).toString()

  // Store OTP directly (no hashing needed for OTP)
  this.emailVerificationOTP = otp

  // Set expire time (10 minutes)
  this.emailVerificationExpire = Date.now() + 10 * 60 * 1000

  return otp
}

// Generate password reset OTP - Replaced token method with OTP method
userSchema.methods.getResetPasswordOTP = function () {
  // Generate 6-digit OTP
  const otp = "999999"
  // const otp = Math.floor(100000 + Math.random() * 900000).toString()

  // Store OTP directly (no hashing needed for OTP)
  this.resetPasswordOTP = otp

  // Set expire time (10 minutes)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000

  return otp
}

userSchema.methods.getResetPasswordToken = function () {
  // Generate secure random token
  const resetToken = crypto.randomBytes(32).toString("hex")

  // Hash and store the token
  this.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex")

  // Set expire time (15 minutes)
  this.resetPasswordTokenExpire = Date.now() + 15 * 60 * 1000

  // Clear OTP fields since verification is complete
  this.resetPasswordOTP = undefined
  this.resetPasswordExpire = undefined

  return resetToken
}

// Static method to find user by email or username
userSchema.statics.findByEmailOrUsername = function (identifier) {
  return this.findOne({
    $or: [{ email: identifier.toLowerCase() }, { username: identifier.toLowerCase() }],
  })
}

// Static method to get user statistics
userSchema.statics.getStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$userType",
        count: { $sum: 1 },
      },
    },
  ])

  const totalUsers = await this.countDocuments()
  const activeUsers = await this.countDocuments({ isActive: true })
  const verifiedUsers = await this.countDocuments({ isEmailVerified: true })

  return {
    total: totalUsers,
    active: activeUsers,
    verified: verifiedUsers,
    byType: stats.reduce((acc, stat) => {
      acc[stat._id] = stat.count
      return acc
    }, {}),
  }
}

module.exports = mongoose.model("User", userSchema)
