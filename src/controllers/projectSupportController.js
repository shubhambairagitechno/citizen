const SocialProjectRegistration = require("../models/SocialProjectRegistration")
const User = require("../models/User")
const ProjectSupport = require("../models/ProjectSupport")
const TokenTransaction = require("../models/TokenTransaction")
const { generateUniqueId } = require("../utils/helpers")
const { sendEmail } = require("../utils/emailService")
const asyncHandler = require("../utils/asyncHandler")
const { successResponse, errorResponse } = require("../utils/responseHelper")

// @desc    Support a project with tokens
// @route   POST /api/projects/:projectId/support
// @access  Private (Citizens only)
const supportProject = asyncHandler(async (req, res) => {
  const { tokensToSpend } = req.body
  const { projectId } = req.params

  // Only citizens can support projects
  if (req.user.userType !== "citizen") {
    return errorResponse(res, "Only citizens can support projects", 403)
  }

  // Check if citizen is approved for token operations
  if (req.user.approvalStatus !== "approved") {
    return errorResponse(res, "Your account must be approved before supporting projects", 403)
  }

  // Validate token amount
  if (!tokensToSpend || tokensToSpend <= 0) {
    return errorResponse(res, "Invalid token amount", 400)
  }

  // Check citizen token balance
  const citizen = await User.findById(req.user._id)
  if (citizen.tokenBalance < tokensToSpend) {
    return errorResponse(res, "Insufficient token balance", 400)
  }

  const projectRegistration = await SocialProjectRegistration.findOne({
    "projects._id": projectId,
  })
  if (!projectRegistration) {
    return errorResponse(res, "Project not found", 404)
  }

  const project = projectRegistration.projects.id(projectId)
  if (!project) {
    return errorResponse(res, "Project not found", 404)
  }

  // Check if project is active (government-approved) — this is the only gate needed
  if (project.projectStatus !== "active") {
    return errorResponse(res, "This project must be approved before receiving token support", 403)
  }

  // Check if citizen already supported this project
  const existingSupport = project.supportedBy.find((support) => support.userId.toString() === req.user._id.toString())

  if (existingSupport) {
    const totalTokens = existingSupport.tokensSpent + tokensToSpend
   
    if (totalTokens > 5) {
      return errorResponse(
        res,
        `Cannot support this project with more than 5 tokens total. Current support: ${existingSupport.tokensSpent} tokens`,
        400,
      )
    }
  }

  // Check if project would exceed funding goal
  const newFundedAmount = project.tokensFunded + tokensToSpend
  if (newFundedAmount > project.fundingGoal) {
    return errorResponse(
      res,
      `Cannot support with ${tokensToSpend} tokens. Project only needs ${project.fundingGoal - project.tokensFunded} more tokens`,
      400,
    )
  }

  // Generate support ID
  const supportId = generateUniqueId("SUP")

  const support = await ProjectSupport.create({
    supportId,
    citizen: req.user._id.toString(),
    project: projectId,
    projectRegistration: projectRegistration._id,
    tokensSpent: tokensToSpend,
    supportedAt: new Date(),
  })

  console.log("[v0] Created support record:", support._id, "for citizen:", support.citizen)

  const transactionId = generateUniqueId("TXN")
  await TokenTransaction.create({
    transactionId,
    transactionType: "spend",
    transactionDirection: "debit", // Citizen is spending tokens
    fromUser: req.user._id,
    toUser: projectRegistration.user, // Project lead receives the tokens
    amount: tokensToSpend,
    tokenType: "civic",
    relatedProject: projectId,
    status: "completed",
    description: `Support for project: ${project.projectTitle}`,
    category: "contribution",
    processedAt: new Date(),
  })

  // Update citizen token balance
  await User.findByIdAndUpdate(req.user._id, {
    $inc: { tokenBalance: -tokensToSpend },
  })

  // Update project funded amount
  project.tokensFunded += tokensToSpend

  // Add citizen to supportedBy list or update existing support
  if (existingSupport) {
    existingSupport.tokensSpent += tokensToSpend
  } else {
    project.supportedBy.push({
      userId: req.user._id,
      tokensSpent: tokensToSpend,
      supportedAt: new Date(),
    })
  }

  await projectRegistration.save()

  // Send notification emails
  const projectLead = await User.findById(projectRegistration.user)

  await Promise.all([
    sendEmail({
      to: citizen.email,
      subject: "Project Support Confirmed",
      template: "projectSupportConfirmed",
      data: {
        citizenName: citizen.fullName,
        projectTitle: project.projectTitle,
        tokensSpent: tokensToSpend,
        supportId,
        remainingBalance: citizen.tokenBalance - tokensToSpend,
      },
    }),
    sendEmail({
      to: projectLead.email,
      subject: "New Project Support Received",
      template: "projectSupportReceived",
      data: {
        projectTitle: project.projectTitle,
        supporterName: citizen.fullName,
        tokensReceived: tokensToSpend,
        totalFunded: project.tokensFunded,
        fundingGoal: project.fundingGoal,
        fundingPercentage: Math.round((project.tokensFunded / project.fundingGoal) * 100),
      },
    }),
  ])

  successResponse(
    res,
    "Project supported successfully",
    {
      support: {
        id: support._id,
        supportId,
        projectTitle: project.projectTitle,
        tokensSpent: tokensToSpend,
        remainingBalance: citizen.tokenBalance - tokensToSpend,
        projectFundingProgress: {
          funded: project.tokensFunded,
          goal: project.fundingGoal,
          percentage: Math.round((project.tokensFunded / project.fundingGoal) * 100),
        },
      },
    },
    201,
  )
})

// @desc    Get citizen's supported projects
// @route   GET /api/projects/my-supported
// @access  Private (Citizens only)
const getMySupportedProjects = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query

  const userId = req.user._id.toString()

  const supportCount = await ProjectSupport.countDocuments({ citizen: userId })

  const supports = await ProjectSupport.find({ citizen: userId })
    .populate({
      path: "projectRegistration",
      select: "projectOrganizationName projects user",
    })
    .sort({ supportedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean()

  const enrichedSupports = supports
    .map((support) => {
      if (!support.projectRegistration) {
        return null
      }

      if (!support.projectRegistration.projects || !Array.isArray(support.projectRegistration.projects)) {
        return null
      }

      const project = support.projectRegistration.projects.find((p) => {
        return p._id.toString() === support.project.toString()
      })

      if (!project) {
        return null
      }

      return {
        _id: support._id,
        supportId: support.supportId,
        projectTitle: project.projectTitle,
        projectType: project.projectType,
        tokensSpent: support.tokensSpent,
        fundingProgress: {
          funded: project.tokensFunded,
          goal: project.fundingGoal,
          percentage: Math.round((project.tokensFunded / project.fundingGoal) * 100),
        },
        supportedAt: support.supportedAt,
      }
    })
    .filter((item) => item !== null)

  const total = await ProjectSupport.countDocuments({ citizen: userId })

  successResponse(res, "Supported projects retrieved successfully", {
    projects: enrichedSupports,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total,
    },
  })
})

// @desc    Get project supporters
// @route   GET /api/projects/:projectId/supporters
// @access  Private
const getProjectSupporters = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query

  const supports = await ProjectSupport.find({ project: req.params.projectId })
    .populate("citizen", "fullName avatar")
    .sort({ supportedAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)

  const total = await ProjectSupport.countDocuments({ project: req.params.projectId })

  const supporters = supports.map((support) => ({
    _id: support._id,
    citizenName: support.citizen.fullName,
    citizenAvatar: support.citizen.avatar,
    tokensContributed: support.tokensSpent,
    supportedAt: support.supportedAt,
  }))

  successResponse(res, "Project supporters retrieved successfully", {
    supporters,
    pagination: {
      current: page,
      pages: Math.ceil(total / limit),
      total,
    },
  })
})

// @desc    Get project support statistics
// @route   GET /api/projects/:projectId/support-stats
// @access  Private
const getProjectSupportStats = asyncHandler(async (req, res) => {
  const { projectId } = req.params

  const projectRegistration = await SocialProjectRegistration.findById(projectId)
  if (!projectRegistration) {
    return errorResponse(res, "Project not found", 404)
  }

  const project = projectRegistration.projects.id(req.params.projectId)
  if (!project) {
    return errorResponse(res, "Project not found", 404)
  }

  const totalSupporters = project.supportedBy.length
  const totalTokensFunded = project.tokensFunded
  const fundingGoal = project.fundingGoal
  const fundingPercentage = Math.round((totalTokensFunded / fundingGoal) * 100)
  const tokensNeeded = Math.max(0, fundingGoal - totalTokensFunded)

  successResponse(res, "Project support statistics retrieved successfully", {
    stats: {
      totalSupporters,
      totalTokensFunded,
      fundingGoal,
      fundingPercentage,
      tokensNeeded,
      isFullyFunded: totalTokensFunded >= fundingGoal,
    },
  })
})

module.exports = {
  supportProject,
  getMySupportedProjects,
  getProjectSupporters,
  getProjectSupportStats,
}
