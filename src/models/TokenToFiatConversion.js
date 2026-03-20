const mongoose = require("mongoose")

const tokenToFiatConversionSchema = new mongoose.Schema(
  {
    // Request Reference
    requestId: {
      type: String,
      unique: true,
      required: true,
    },

    // User Information (Social Project User)
    socialProjectUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Related Project
    relatedProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocialProjectRegistration",
      required: true,
    },

    // Token Details
    tokenAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    conversionRate: {
      type: Number,
      required: true,
      default: 1, // e.g., 1 token = 1 unit of fiat
    },

    fiatAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    fiatCurrency: {
      type: String,
      required: true,
      default: "USD",
      enum: ["USD", "EUR", "GBP", "INR", "CAD", "AUD"],
    },

    // Bank Details
    bankDetails: {
      accountHolderName: {
        type: String,
        required: true,
        trim: true,
      },
      bankName: {
        type: String,
        required: true,
        trim: true,
      },
      accountNumber: {
        type: String,
        required: true,
        trim: true,
      },
      ifscCode: {
        type: String,
        trim: true,
      },
      swiftCode: {
        type: String,
        trim: true,
      },
      routingNumber: {
        type: String,
        trim: true,
      },
      country: {
        type: String,
        required: true,
        trim: true,
      },
      bankDocuments: [
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
    },

    // Request Status
    status: {
      type: String,
      enum: ["pending", "approved_by_government", "paid", "rejected", "cancelled"],
      default: "pending",
    },

    // Government Approval
    governmentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: Date,

    paymentDetails: {
      transactionId: String,
      paidAt: Date,
      paymentMethod: {
        type: String,
        enum: ["bank_transfer", "check", "wire", "other"],
      },
      paymentNotes: String,
      bankTransferDetails: {
        senderBankName: String,
        transferDate: Date,
        referenceNumber: String,
        confirmationDocument: {
          fileName: String,
          fileUrl: String,
          fileType: String,
          uploadedAt: Date,
        },
      },
    },

    // Token Transaction Record
    tokenTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TokenTransaction",
    },

    // Rejection Details
    rejectionReason: String,
    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // History/Comments
    comments: [
      {
        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        comment: String,
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Additional Fields
    internalNotes: String,
    verificationStatus: {
      type: String,
      enum: ["pending_verification", "verified", "verification_failed"],
      default: "pending_verification",
    },
  },
  {
    timestamps: true,
  },
)

// Indexes
tokenToFiatConversionSchema.index({ socialProjectUser: 1 })
tokenToFiatConversionSchema.index({ relatedProject: 1 })
tokenToFiatConversionSchema.index({ governmentUser: 1 })
tokenToFiatConversionSchema.index({ socialProjectUser: 1, status: 1 })
tokenToFiatConversionSchema.index({ createdAt: -1 })

module.exports = mongoose.model("TokenToFiatConversion", tokenToFiatConversionSchema)
