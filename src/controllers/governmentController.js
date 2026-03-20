const Government = require("../models/Government")
const User = require("../models/User")
const RegistrationApproval = require("../models/RegistrationApproval")
const SocialProjectRegistration = require("../models/SocialProjectRegistration")
const TokenClaim = require("../models/TokenClaim")
const FundRequest = require("../models/FundRequest")
const TokenTransaction = require("../models/TokenTransaction")
const TokenRequest = require("../models/TokenRequest") // Added TokenRequest model import
const { generateUniqueId } = require("../utils/helpers")
const { sendEmail } = require("../utils/emailService")
const asyncHandler = require("../utils/asyncHandler")
const { successResponse, errorResponse } = require("../utils/responseHelper")

// ============================================
// EXISTING FUNCTIONS (registration)
// ============================================

// Step 1: Institutional Information
// @desc    Register government (step 1)
// @route   POST /api/government/register/step-1
// @access  Public
const registerGovernmentStep1 = asyncHandler(async (req, res) => {
  const {
    governmentName,
    entityType,
    country,
    province,
    city,
    representativeName,
    representativeRole,
    institutionalEmail,
  } = req.body

  const existingGov = await Government.findOne({
    $or: [{ institutionalEmail }, { governmentName, entityType, city }],
  })
  if (existingGov) return errorResponse(res, "Government entity already started registration", 400)

  const registrationNumber = generateUniqueId("GOV")

  const government = await Government.create({
    governmentName,
    entityType,
    country,
    province,
    city,
    representativeName,
    representativeRole,
    institutionalEmail,
    registrationNumber,
    status: "pending",
    verificationStatus: "unverified",
  })

  return successResponse(
    res,
    "Government registration step 1 saved",
    {
      government: {
        _id: government._id,
        governmentName,
        registrationNumber,
        status: government.status,
      },
    },
    201,
  )
})

// Step 2: Main Contact & Consents -> Submit for approval
// @desc    Complete government registration (step 2)
// @route   PUT /api/government/register/step-2/:id
// @access  Public
const registerGovernmentStep2 = asyncHandler(async (req, res) => {
  const { id } = req.params
  const { officialWebsite, comments, consentContactBeforeActivation, acceptedTermsAndConditions } = req.body

  const government = await Government.findById(id)
  if (!government) return errorResponse(res, "Government draft not found", 404)

  government.officialWebsite = officialWebsite
  government.comments = comments
  government.consentContactBeforeActivation = !!consentContactBeforeActivation
  government.acceptedTermsAndConditions = !!acceptedTermsAndConditions
  await government.save()

  await RegistrationApproval.create({
    applicationType: "government",
    applicantId: government._id,
    applicantModel: "Government", // Changed applicantModel from "government" to "Government"
    status: "pending",
    submittedAt: new Date(),
  })

  await sendEmail({
    email: government.institutionalEmail,
    subject: "Government Registration Submitted",
    template: "governmentRegistrationSubmitted",
    data: {
      governmentName: government.governmentName,
      representativeName: government.representativeName,
      registrationNumber: government.registrationNumber,
    },
  })

  return successResponse(res, "Government registration submitted successfully", {
    government: {
      _id: government._id,
      governmentName: government.governmentName,
      status: government.status,
    },
  })
})

// @desc    Get government profile
// @route   GET /api/government/profile
// @access  Private
const getGovernmentProfile = asyncHandler(async (req, res) => {
  const government = await Government.findOne({ userId: req.user._id })
    .populate("userId", "fullName email")
    .populate("approvedBy", "fullName")

  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  successResponse(res, "Government profile retrieved successfully", { government })
})

// @desc    Update government profile
// @route   PUT /api/government/profile
// @access  Private
const updateGovernmentProfile = asyncHandler(async (req, res) => {
  const government = await Government.findOne({ userId: req.user._id })

  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  const allowedUpdates = ["representativeName", "representativeRole", "officialWebsite", "comments"]

  const updates = {}
  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field]
    }
  })

  const updatedGovernment = await Government.findByIdAndUpdate(government._id, updates, {
    new: true,
    runValidators: true,
  })

  successResponse(res, "Government profile updated successfully", {
    government: updatedGovernment,
  })
})

// ============================================
// NEW FUNCTIONS (government operations)
// ============================================

// REGISTRATION REQUEST REVIEW

// @desc    Get citizens pending approval for token operations (city-scoped)
// @route   GET /api/government/registrations/citizens
// @access  Private (government)
const getPendingCitizenRegistrations = asyncHandler(async (req, res) => {
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const { page = 1, limit = 20, approvalStatus = "pending" } = req.query
  const skip = (page - 1) * limit

  // Fetch citizens from the same city with pending approval status
  const filter = {
    city: { $regex: `^${government.city}$`, $options: "i" },
    userType: "citizen",
    approvalStatus: approvalStatus,
  }

  const citizens = await User.find(filter)
    .select("fullName email username city country province approvalStatus createdAt tokenBalance")
    .skip(skip)
    .limit(Number(limit))
    .sort({ createdAt: -1 })
    .lean()

  const total = await User.countDocuments(filter)

  successResponse(res, "Citizens retrieved", {
    citizens,
    pagination: { page: Number(page), limit: Number(limit), total },
  })
})

// @desc    Approve citizen for token operations
// @route   POST /api/government/citizens/:citizenId/approve
// @access  Private (government)
const approveCitizen = asyncHandler(async (req, res) => {
  const { citizenId } = req.params
  const { approvalNotes } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const citizen = await User.findById(citizenId)
  if (!citizen) return errorResponse(res, "Citizen not found", 404)

  // Verify it's a citizen user type
  if (citizen.userType !== "citizen") {
    return errorResponse(res, "User is not a citizen", 400)
  }

  // City-based authorization check (case-insensitive)
  if (citizen.city?.toLowerCase() !== government.city?.toLowerCase()) {
    return errorResponse(res, "Cannot approve citizen from a different city", 403)
  }

  if (citizen.approvalStatus === "approved") {
    return errorResponse(res, "Citizen is already approved", 400)
  }

  // Update citizen approval status
  citizen.approvalStatus = "approved"
  citizen.approvalStatusUpdatedAt = new Date()
  citizen.approvalStatusUpdatedBy = req.user._id
  await citizen.save()

  // Send approval email
  await sendEmail({
    email: citizen.email,
    subject: "Account Approved for Token Operations",
    template: "citizenApproved",
    data: {
      citizenName: citizen.fullName,
      approvalNotes,
    },
  })

  successResponse(res, "Citizen approved for token operations", { citizen })
})

// @desc    Reject citizen for token operations
// @route   POST /api/government/citizens/:citizenId/reject
// @access  Private (government)
const rejectCitizen = asyncHandler(async (req, res) => {
  const { citizenId } = req.params
  const { rejectionReason } = req.body

  if (!rejectionReason) {
    return errorResponse(res, "Rejection reason is required", 400)
  }

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const citizen = await User.findById(citizenId)
  if (!citizen) return errorResponse(res, "Citizen not found", 404)

  // Verify it's a citizen user type
  if (citizen.userType !== "citizen") {
    return errorResponse(res, "User is not a citizen", 400)
  }

  // City-based authorization check (case-insensitive)
  if (citizen.city?.toLowerCase() !== government.city?.toLowerCase()) {
    return errorResponse(res, "Cannot reject citizen from a different city", 403)
  }

  // Update citizen approval status
  citizen.approvalStatus = "rejected"
  citizen.approvalStatusUpdatedAt = new Date()
  citizen.approvalStatusUpdatedBy = req.user._id
  await citizen.save()

  // Send rejection email
  await sendEmail({
    email: citizen.email,
    subject: "Account Not Approved for Token Operations",
    template: "citizenRejected",
    data: {
      citizenName: citizen.fullName,
      rejectionReason,
    },
  })

  successResponse(res, "Citizen rejected for token operations", { citizen })
})



// @desc    Get pending social project registrations (city-scoped)
// @route   GET /api/government/registrations/projects
// @access  Private (government)
const getPendingSocialProjectRegistrations = asyncHandler(async (req, res) => {
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const { page = 1, limit = 20, status = "pending" } = req.query
  const skip = (page - 1) * limit

  console.log("[v0] getPendingSocialProjectRegistrations - government city:", government.city, "province:", government.province, "country:", government.country, "status filter:", status)

  // Use case-insensitive regex on city/state/country so casing differences never cause mismatches
  const filter = {
    city: { $regex: new RegExp(`^${government.city.trim()}$`, "i") },
    status: status,
  }

  console.log("[v0] getPendingSocialProjectRegistrations - filter:", JSON.stringify(filter))

  // Fetch social project registrations from the same city
  const registrations = await SocialProjectRegistration.find(filter)
    .populate("user", "fullName email city")
    .skip(skip)
    .limit(Number(limit))
    .sort({ submittedAt: -1 })
    .lean()

  const total = await SocialProjectRegistration.countDocuments(filter)

  console.log("[v0] getPendingSocialProjectRegistrations - found:", total, "registrations")

  // Format response with projects
  const formattedRegistrations = registrations.map((reg) => ({
    _id: reg._id,
    projectOrganizationName: reg.projectOrganizationName,
    user: reg.user,
    city: reg.city,
    state: reg.state,
    country: reg.country,
    status: reg.status,
    submittedAt: reg.submittedAt,
    projectsCount: reg.projects ? reg.projects.length : 0,
    projects: reg.projects || [],
  }))

  successResponse(res, "Social project registrations retrieved", {
    registrations: formattedRegistrations,
    pagination: { page: Number(page), limit: Number(limit), total },
  })
})



// @desc    Approve social project registration
// @route   POST /api/government/registrations/projects/:projectId/approve
// @access  Private (government)
const approveSocialProjectRegistration = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const { approvalNotes } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const project = await SocialProjectRegistration.findById(projectId).populate("user", "fullName email")
  if (!project) return errorResponse(res, "Project registration not found", 404)

  // City-based authorization check (case-insensitive)
  if (project.city?.toLowerCase() !== government.city?.toLowerCase()) {
    return errorResponse(res, "Cannot approve project from a different city", 403)
  }

  if (project.status !== "pending") {
    return errorResponse(res, "This project has already been processed", 400)
  }

  project.status = "approved"
  project.approvedBy = req.user._id
  project.approvedAt = new Date()
  if (approvalNotes) {
    project.registrationNotes = approvalNotes
  }
  await project.save()

  // Update RegistrationApproval record
  const approvalRecord = await RegistrationApproval.findOne({
    applicantId: project._id,
    applicantModel: "SocialProjectRegistration",
  })
  if (approvalRecord) {
    approvalRecord.status = "approved"
    approvalRecord.reviewedBy = req.user._id
    approvalRecord.reviewedAt = new Date()
    approvalRecord.approvalDecision = "approved"
    await approvalRecord.save()
  }

  // Update user's project approval status
  await User.findByIdAndUpdate(project.user, {
    isGovernmentApproveProject: true,
  })

  // NOTE: Individual projects inside this registration still require separate government approval
  // via PUT /api/social-projects/:projectId/approve before they become visible to citizens.

  // Send approval email
  await sendEmail({
    email: project.user.email,
    subject: "Project Registration Approved",
    template: "projectRegistrationApproved",
    data: { projectName: project.projectOrganizationName, approvalNotes },
  })

  successResponse(res, "Social project registration approved", { project })
})

// @desc    Reject social project registration
// @route   POST /api/government/registrations/projects/:projectId/reject
// @access  Private (government)
const rejectSocialProjectRegistration = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const { rejectionReason } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const project = await SocialProjectRegistration.findById(projectId).populate("user", "fullName email")
  if (!project) return errorResponse(res, "Project registration not found", 404)

  // City-based authorization check (case-insensitive)
  if (project.city?.toLowerCase() !== government.city?.toLowerCase()) {
    return errorResponse(res, "Cannot reject project from a different city", 403)
  }

  if (project.status !== "pending") {
    return errorResponse(res, "This project has already been processed", 400)
  }

  project.status = "rejected"
  project.approvedBy = req.user._id
  project.rejectionReason = rejectionReason
  await project.save()

  // Update RegistrationApproval record
  const approvalRecord = await RegistrationApproval.findOne({
    applicantId: project._id,
    applicantModel: "SocialProjectRegistration",
  })
  if (approvalRecord) {
    approvalRecord.status = "rejected"
    approvalRecord.reviewedBy = req.user._id
    approvalRecord.reviewedAt = new Date()
    approvalRecord.approvalDecision = "rejected"
    approvalRecord.rejectionReason = rejectionReason
    await approvalRecord.save()
  }

  // Send rejection email
  await sendEmail({
    email: project.user.email,
    subject: "Project Registration Rejected",
    template: "projectRegistrationRejected",
    data: { projectName: project.projectOrganizationName, reason: rejectionReason },
  })

  successResponse(res, "Social project registration rejected", { project })
})

// TOKEN CLAIM REVIEW

// @desc    Get pending token claims (city-scoped)
// @route   GET /api/government/token-claims
// @access  Private (government)
const getPendingTokenClaims = asyncHandler(async (req, res) => {
  
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const { page = 1, limit = 20, status = "pending" } = req.query

  // Get claims from citizens in the same city
  const claims = await TokenClaim.find({ status })
    .populate({
      path: "claimant",
      match: { city: government.city },
      select: "fullName email city tokenBalance",
    })
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ createdAt: -1 })

  // Filter out null claimants (from different cities)
  const filteredClaims = claims.filter((claim) => claim.claimant !== null)

  const total = await TokenClaim.countDocuments({
    status,
  })

  successResponse(res, "Token claims retrieved", {
    claims: filteredClaims,
    pagination: { page: Number(page), limit: Number(limit), total },
  })
})

// @desc    Approve token claim
// @route   POST /api/government/token-claims/:claimId/approve
// @access  Private (government)
const approveTokenClaim = asyncHandler(async (req, res) => {

  const { claimId } = req.params
  const { reviewNotes } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const claim = await TokenClaim.findById(claimId).populate("claimant")
  if (!claim) return errorResponse(res, "Token claim not found", 404)

  if (claim.claimant.city !== government.city) {
    return errorResponse(res, "Cannot approve claim from a different city", 403)
  }

  // Create token transaction
  const transaction = await TokenTransaction.create({
    transactionId: generateUniqueId("TXN"),
    transactionType: "issue",
    transactionDirection: "credit",
    toUser: claim.claimant._id,
    amount: claim.calculatedTokens,
    issuedBy: req.user._id,
    approvedBy: req.user._id,
    description: `Approved token claim for ${claim.paymentType}`,
    status: "completed",
    processedAt: new Date(),
  })

  // Update claim status
  claim.status = "approved"
  claim.reviewedBy = req.user._id
  claim.reviewedAt = new Date()
  claim.reviewNotes = reviewNotes
  claim.tokenTransaction = transaction._id
  await claim.save()

  // Update citizen wallet
  await User.findByIdAndUpdate(claim.claimant._id, { $inc: { tokenBalance: claim.calculatedTokens } }, { new: true })

  // Send approval email
  await sendEmail({
    email: claim.claimant.email,
    subject: "Token Claim Approved",
    template: "tokenClaimApproved",
    data: {
      citizenName: claim.claimant.fullName,
      tokenAmount: claim.calculatedTokens,
    },
  })

  successResponse(res, "Token claim approved", { claim, transaction })
})

// @desc    Reject token claim
// @route   POST /api/government/token-claims/:claimId/reject
// @access  Private (government)
const rejectTokenClaim = asyncHandler(async (req, res) => {
    console.log("Reject-TokenClaim")
  const { claimId } = req.params
  const { rejectionReason, reviewNotes } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const claim = await TokenClaim.findById(claimId).populate("claimant")
  if (!claim) return errorResponse(res, "Token claim not found", 404)

  if (claim.claimant.city !== government.city) {
    return errorResponse(res, "Cannot reject claim from a different city", 403)
  }

  claim.status = "rejected"
  claim.reviewedBy = req.user._id
  claim.reviewedAt = new Date()
  claim.rejectionReason = rejectionReason
  claim.reviewNotes = reviewNotes
  await claim.save()

  // Send rejection email
  await sendEmail({
    email: claim.claimant.email,
    subject: "Token Claim Rejected",
    template: "tokenClaimRejected",
    data: {
      citizenName: claim.claimant.fullName,
      reason: rejectionReason,
    },
  })

  successResponse(res, "Token claim rejected", { claim })
})

// MANUAL TOKEN ISSUE / TRANSFER

// @desc    Issue tokens to citizen
// @route   POST /api/government/tokens/issue
// @access  Private (government)
const issueTokens = asyncHandler(async (req, res) => {
  const { citizenId, tokenAmount } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const citizen = await User.findById(citizenId)
  if (!citizen) return errorResponse(res, "Citizen not found", 404)

  if (citizen.city !== government.city) {
    return errorResponse(res, "Cannot issue tokens to citizen from a different city", 403)
  }

  // Check if citizen is approved for token operations
  if (citizen.approvalStatus !== "approved") {
    return errorResponse(res, "Citizen must be approved before receiving tokens", 403)
  }

  // Create token transaction
  const transaction = await TokenTransaction.create({
    transactionId: generateUniqueId("TXN"),
    transactionType: "issue",
    transactionDirection: "credit",
    toUser: citizen._id,
    amount: tokenAmount,
    issuedBy: req.user._id,
    approvedBy: req.user._id,
    description: `Manual token issue by government`,
    status: "completed",
    processedAt: new Date(),
  })

  // Update citizen wallet
  const updatedCitizen = await User.findByIdAndUpdate(
    citizen._id,
    { $inc: { tokenBalance: tokenAmount } },
    { new: true },
  )

  successResponse(res, "Tokens issued successfully", { transaction, citizen: updatedCitizen })
})

// @desc    Transfer tokens between citizens
// @route   POST /api/government/tokens/transfer
// @access  Private (government)
const transferTokens = asyncHandler(async (req, res) => {
  const { fromCitizenId, toCitizenId, tokenAmount } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const fromCitizen = await User.findById(fromCitizenId)
  const toCitizen = await User.findById(toCitizenId)

  if (!fromCitizen || !toCitizen) {
    return errorResponse(res, "One or both citizens not found", 404)
  }

  if (fromCitizen.city !== government.city || toCitizen.city !== government.city) {
    return errorResponse(res, "Cannot transfer tokens to/from citizens in a different city", 403)
  }

  // Check if both parties are approved for token operations
  if (fromCitizen.approvalStatus !== "approved") {
    return errorResponse(res, "Sending citizen must be approved for token transfers", 403)
  }
  if (toCitizen.approvalStatus !== "approved") {
    return errorResponse(res, "Receiving citizen must be approved for token transfers", 403)
  }

  // Check sender balance
  if (fromCitizen.tokenBalance < tokenAmount) {
    return errorResponse(res, "Insufficient token balance", 400)
  }

  // Create token transaction
  const transaction = await TokenTransaction.create({
    transactionId: generateUniqueId("TXN"),
    transactionType: "transfer",
    transactionDirection: "credit",
    fromUser: fromCitizen._id,
    toUser: toCitizen._id,
    amount: tokenAmount,
    issuedBy: req.user._id,
    approvedBy: req.user._id,
    description: `Government-authorized transfer`,
    status: "completed",
    processedAt: new Date(),
  })

  // Update wallets
  await User.findByIdAndUpdate(fromCitizen._id, { $inc: { tokenBalance: -tokenAmount } })
  const updatedToCitizen = await User.findByIdAndUpdate(
    toCitizen._id,
    { $inc: { tokenBalance: tokenAmount } },
    { new: true },
  )

  successResponse(res, "Tokens transferred successfully", { transaction })
})

// SOCIAL PROJECT FUND REQUEST REVIEW

// @desc    Get pending fund requests (city-scoped)
// @route   GET /api/government/fund-requests
// @access  Private (government)
const getPendingFundRequests = asyncHandler(async (req, res) => {
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const { page = 1, limit = 20, status = "pending" } = req.query

  const requests = await FundRequest.find({
    status,
    city: government.city,
  })
    .populate("projectId", "projectOrganizationName")
    .populate("requestedBy", "fullName email")
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ createdAt: -1 })

  const total = await FundRequest.countDocuments({
    status,
    city: government.city,
  })

  successResponse(res, "Fund requests retrieved", {
    requests,
    pagination: { page: Number(page), limit: Number(limit), total },
  })
})

// @desc    Approve fund request
// @route   POST /api/government/fund-requests/:fundRequestId/approve
// @access  Private (government)
const approveFundRequest = asyncHandler(async (req, res) => {
  const { fundRequestId } = req.params
  const { reviewNotes } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const fundRequest = await FundRequest.findById(fundRequestId).populate("projectId").populate("requestedBy")

  if (!fundRequest) return errorResponse(res, "Fund request not found", 404)

  if (fundRequest.city !== government.city) {
    return errorResponse(res, "Cannot approve fund request from a different city", 403)
  }

  // Verify project is approved for token operations
  if (fundRequest.projectId.approvalStatus !== "approved") {
    return errorResponse(res, "Project must be approved before fund requests can be processed", 403)
  }

  // Create token transaction for fiat conversion
  const transaction = await TokenTransaction.create({
    transactionId: generateUniqueId("TXN"),
    transactionType: "transfer",
    transactionDirection: "debit",
    fromUser: fundRequest.requestedBy._id,
    toUser: fundRequest.requestedBy._id, // Back to same user (conversion)
    amount: fundRequest.tokenAmount,
    issuedBy: req.user._id,
    approvedBy: req.user._id,
    description: `Fund request approval: ${fundRequest.requestedFiatAmount} ${fundRequest.fiatCurrency}`,
    status: "completed",
    processedAt: new Date(),
  })

  // Update fund request
  fundRequest.status = "approved"
  fundRequest.reviewedBy = req.user._id
  fundRequest.reviewedAt = new Date()
  fundRequest.reviewNotes = reviewNotes
  fundRequest.tokenTransaction = transaction._id
  await fundRequest.save()

  // Deduct tokens from project wallet
  await User.findByIdAndUpdate(
    fundRequest.requestedBy._id,
    { $inc: { tokenBalance: -fundRequest.tokenAmount } },
    { new: true },
  )

  successResponse(res, "Fund request approved", { fundRequest, transaction })
})

// @desc    Reject fund request
// @route   POST /api/government/fund-requests/:fundRequestId/reject
// @access  Private (government)
const rejectFundRequest = asyncHandler(async (req, res) => {
  const { fundRequestId } = req.params
  const { rejectionReason, reviewNotes } = req.body

  const government = await Government.findOne({ userId: req.user._id })
  if (!government) return errorResponse(res, "Government profile not found", 404)

  const fundRequest = await FundRequest.findById(fundRequestId).populate("requestedBy")
  if (!fundRequest) return errorResponse(res, "Fund request not found", 404)

  if (fundRequest.city !== government.city) {
    return errorResponse(res, "Cannot reject fund request from a different city", 403)
  }

  fundRequest.status = "rejected"
  fundRequest.reviewedBy = req.user._id
  fundRequest.reviewedAt = new Date()
  fundRequest.rejectionReason = rejectionReason
  fundRequest.reviewNotes = reviewNotes
  await fundRequest.save()

  // Send rejection email
  await sendEmail({
    email: fundRequest.requestedBy.email,
    subject: "Fund Request Rejected",
    template: "fundRequestRejected",
    data: {
      projectName: fundRequest.projectId.projectOrganizationName,
      reason: rejectionReason,
    },
  })

  successResponse(res, "Fund request rejected", { fundRequest })
})

// TOKEN REQUEST REVIEW

// @desc    Get pending token requests (government only, city-scoped)
// @route   GET /api/government/token-requests
// @access  Private (government)
const getPendingTokenRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status = "pending" } = req.query

  // Get government profile
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

const filter = {
  city: { $regex: `^${government.city}$`, $options: "i" },
  status: status || "pending",
};


  const tokenRequests = await TokenRequest.find(filter)
    .populate("requestedBy", "fullName email username city")
    .populate("reviewedBy", "fullName email")
    .skip((page - 1) * limit)
    .limit(Number(limit))
    .sort({ createdAt: -1 })

  const total = await TokenRequest.countDocuments(filter)

  successResponse(res, "Token requests retrieved", {
    requests: tokenRequests,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
    },
  })
})

// @desc    Approve token request (government only)
// @route   POST /api/government/token-requests/:tokenRequestId/approve
// @access  Private (government)
const approveTokenRequest = asyncHandler(async (req, res) => {
  const { tokenRequestId } = req.params
  const { reviewNotes } = req.body

  // Get government profile
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  // Find token request
  const tokenRequest = await TokenRequest.findById(tokenRequestId).populate("requestedBy")
  if (!tokenRequest) {
    return errorResponse(res, "Token request not found", 404)
  }

  if (tokenRequest.city !== government.city) {
    return errorResponse(res, "Cannot approve token request from different city", 403)
  }

  // Get citizen
  const citizen = await User.findById(tokenRequest.requestedBy._id)
  if (!citizen) {
    return errorResponse(res, "Citizen not found", 404)
  }

  try {
    // Create token transaction
    const transaction = await TokenTransaction.create({
      transactionId: generateUniqueId("TXN"),
      transactionType: "issue",
      transactionDirection: "credit",
      toUser: citizen._id,
      amount: tokenRequest.tokenAmount,
      issuedBy: req.user._id,
      approvedBy: req.user._id,
      description: `Approved token request ${tokenRequest.tokenRequestId}`,
      status: "completed",
      processedAt: new Date(),
    })

    // Update citizen wallet
    const updatedCitizen = await User.findByIdAndUpdate(
      citizen._id,
      { $inc: { tokenBalance: tokenRequest.tokenAmount } },
      { new: true },
    )

    // Update token request
    await TokenRequest.findByIdAndUpdate(tokenRequestId, {
      status: "approved",
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || "",
      tokenTransaction: transaction._id,
    })

    // Send approval email to citizen
    await sendEmail({
      email: citizen.email,
      subject: "Token Request Approved",
      template: "tokenRequestApproved",
      data: {
        citizenName: citizen.fullName,
        tokenRequestId: tokenRequest.tokenRequestId,
        tokenAmount: tokenRequest.tokenAmount,
        newBalance: updatedCitizen.tokenBalance,
      },
    })

    successResponse(res, "Token request approved successfully", { transaction, citizen: updatedCitizen })
  } catch (error) {
    console.error("Token request approval error:", error)
    errorResponse(res, "Failed to approve token request", 500)
  }
})

// @desc    Reject token request (government only)
// @route   POST /api/government/token-requests/:tokenRequestId/reject
// @access  Private (government)
const rejectTokenRequest = asyncHandler(async (req, res) => {
  const { tokenRequestId } = req.params
  const { rejectionReason, reviewNotes } = req.body

  if (!rejectionReason) {
    return errorResponse(res, "Rejection reason is required", 400)
  }

  // Get government profile
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  // Find token request
  const tokenRequest = await TokenRequest.findById(tokenRequestId).populate("requestedBy")
  if (!tokenRequest) {
    return errorResponse(res, "Token request not found", 404)
  }

  if (tokenRequest.city !== government.city) {
    return errorResponse(res, "Cannot reject token request from different city", 403)
  }

  const citizen = await User.findById(tokenRequest.requestedBy._id)

  try {
    // Update token request
    await TokenRequest.findByIdAndUpdate(tokenRequestId, {
      status: "rejected",
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      rejectionReason,
      reviewNotes: reviewNotes || "",
    })

    // Send rejection email to citizen
    await sendEmail({
      email: citizen.email,
      subject: "Token Request Rejected",
      template: "tokenRequestRejected",
      data: {
        citizenName: citizen.fullName,
        tokenRequestId: tokenRequest.tokenRequestId,
        rejectionReason,
      },
    })

    successResponse(res, "Token request rejected successfully", { tokenRequest })
  } catch (error) {
    console.error("Token request rejection error:", error)
    errorResponse(res, "Failed to reject token request", 500)
  }
})

module.exports = {
  // Existing
  registerGovernmentStep1,
  registerGovernmentStep2,
  getGovernmentProfile,
  updateGovernmentProfile,
  // Citizen approval for token operations
  getPendingCitizenRegistrations,
  approveCitizen,
  rejectCitizen,
  // Social project approval
  getPendingSocialProjectRegistrations,
  approveSocialProjectRegistration,
  rejectSocialProjectRegistration,
  // Token operations
  getPendingTokenClaims,
  approveTokenClaim,
  rejectTokenClaim,
  issueTokens,
  transferTokens,
  getPendingFundRequests,
  approveFundRequest,
  rejectFundRequest,
  getPendingTokenRequests,
  approveTokenRequest,
  rejectTokenRequest,
}
