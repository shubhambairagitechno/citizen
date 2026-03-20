const SocialProjectRegistration = require("../models/SocialProjectRegistration")
const User = require("../models/User")
const Government = require("../models/Government")
const AllocationLimit = require("../models/AllocationLimit")
const ProjectSupport = require("../models/ProjectSupport") // Import ProjectSupport
const TokenTransaction = require("../models/TokenTransaction") // Import TokenTransaction
const asyncHandler = require("../utils/asyncHandler")
const { successResponse, errorResponse } = require("../utils/responseHelper")
const { sendEmail } = require("../utils/emailService")
const { validationResult } = require("express-validator")
const { generateUniqueId } = require("../utils/helpers") // Import generateUniqueId
const { getFullFileUrl, formatDocumentation } = require("../utils/urlHelper")
const path = require("path")
const localStorageService = require("../utils/localStorageService") // added localStorageService import for file uploads

// @desc    Submit social project registration (select project types)
// @route   POST /api/social-projects/register
// @access  Private (Social Project users only)
const submitSocialProjectRegistration = asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return errorResponse(res, "Validation failed", 400, errors.array())
  }

  if (req.user.userType !== "social_project") {
    return errorResponse(res, "Only social project users can submit this registration", 403)
  }

  const existingRegistration = await SocialProjectRegistration.findOne({ user: req.user._id })

  if (existingRegistration) {
    return errorResponse(res, "You have already submitted a project registration", 400)
  }

  const {
    projectOrganizationName,
    allowedProjectTypes,
    state,
    city,
    country,
    responsiblePersonFullName,
    personPositionRole,
    contactNumber,
    emailAddress,
    registrationNotes,
  } = req.body

  const documents = []
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        const result = await localStorageService.uploadFile(file.buffer, {
          folder: `municipality/applications/${Date.now()}/documents`,
          originalName: file.originalname,
          mimetype: file.mimetype,
          public_id: `app_doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`,
        })

        const fileUrl = result.secure_url || result.url
        console.log("[v0] Document uploaded:", {
          originalName: file.originalname,
          fileUrl,
          fullPath: result.secure_url,
        })

        documents.push({
          fileName: file.originalname,
          fileUrl: fileUrl,
          fileType: file.mimetype,
          uploadedAt: new Date(),
        })
      } catch (error) {
        console.error("[v0] File upload error:", error)
        return errorResponse(res, "Failed to upload document", 500)
      }
    }
  }

  // Derive location: prefer body values, fall back to user profile
  const registrationCity = (city || req.user.city || "").trim()
  const registrationState = (state || req.user.province || "").trim()
  const registrationCountry = (country || req.user.country || "").trim()

  if (!registrationCity || !registrationState || !registrationCountry) {
    return errorResponse(
      res,
      "City, state and country are required. Please complete your profile location or provide them in the request.",
      400,
    )
  }

  const registration = await SocialProjectRegistration.create({
    user: req.user._id,
    projectOrganizationName,
    allowedProjectTypes,
    state: registrationState,
    city: registrationCity,
    country: registrationCountry,
    responsiblePersonFullName,
    personPositionRole,
    contactNumber,
    emailAddress,
    documents,
    registrationNotes,
    status: "pending", // Requires government approval — NOT auto-approved
  })

  // Update user's isRegistrationProjectDone to true
  await User.findByIdAndUpdate(req.user._id, { isRegistrationProjectDone: true })

  if (registration) {
    const responseData = {
      ...registration.toObject(),
      isRegistrationProjectDone: true, // User submitted project registration
    }

    successResponse(
      res,
      "Social project registration submitted successfully. Awaiting government approval to create projects.",
      responseData,
      201,
    )
  }
})

// @desc    Get user's social project registration
// @route   GET /api/social-projects/my-registration
// @access  Private (Social Project users only)
const getMyRegistration = asyncHandler(async (req, res) => {
  if (req.user.userType !== "social_project") {
    return errorResponse(res, "Only social project users can view registration", 403)
  }

  const registration = await SocialProjectRegistration.findOne({ user: req.user._id }).populate(
    "approvedBy",
    "fullName",
  )

  if (!registration) {
    return errorResponse(res, "No registration found", 404)
  }

  const responseData = {
    ...registration.toObject(),
    isRegistrationProjectDone: true, // User has submitted project registration
  }

  successResponse(res, "Social project registration retrieved successfully", responseData)
})

// @desc    Get all ACTIVE projects (PUBLIC - no auth)
// @route   GET /api/social-projects
const getAllProjects = asyncHandler(async (req, res) => {
  // Only return active projects from approved registrations — never expose pending_approval projects
  const registrations = await SocialProjectRegistration.find({
    status: "approved",
    "projects.projectStatus": "active",
  })
    .select("projectOrganizationName city state country projects")
    .sort({ createdAt: -1 })
    .lean()

  const projects = registrations.flatMap((reg) =>
    (reg.projects || [])
      .filter((p) => p.projectStatus === "active")
      .map((p) => ({
        ...p,
        organizationName: reg.projectOrganizationName,
        organizationCity: reg.city,
      })),
  )
  successResponse(res, "Active projects retrieved", projects)
})

// @desc    Get all pending social project registrations (Government only)
// @route   GET /api/social-projects/registrations/pending
// @access  Private (Government only)
const getPendingRegistrations = asyncHandler(async (req, res) => {
  if (req.user.userType !== "government") {
    return errorResponse(res, "Only government users can view pending registrations", 403)
  }

  const { page = 1, limit = 10 } = req.query
  const skip = (page - 1) * limit

  // Load the Government profile to get the authoritative city/province/country
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  console.log("[v0] getPendingRegistrations - government city:", government.city, "province:", government.province, "country:", government.country)

  // Use case-insensitive regex so casing differences never cause mismatches
  const query = {
    status: "pending",
    city: { $regex: new RegExp(`^${government.city.trim()}$`, "i") },
  }

  console.log("[v0] getPendingRegistrations - query:", JSON.stringify(query))

  const [registrations, total] = await Promise.all([
    SocialProjectRegistration.find(query)
      .populate("user", "fullName email country city")
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(Number.parseInt(limit))
      .lean(),
    SocialProjectRegistration.countDocuments(query),
  ])

  console.log("[v0] getPendingRegistrations - found:", total, "registrations")

  const pagination = {
    currentPage: Number.parseInt(page),
    totalPages: Math.ceil(total / limit),
    totalRegistrations: total,
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  }

  successResponse(res, "Pending social project registrations retrieved successfully", {
    registrations,
    pagination,
  })
})

// @desc    Process social project registration approval (Government only)
// @route   PUT /api/social-projects/registrations/:id/decision
// @access  Private (Government only)
const processSocialProjectDecision = asyncHandler(async (req, res) => {
  if (req.user.userType !== "government") {
    return errorResponse(res, "Only government users can approve registrations", 403)
  }

  const { decision, rejectionReason, approvalNotes } = req.body

  if (!["approved", "rejected"].includes(decision)) {
    return errorResponse(res, "Decision must be 'approved' or 'rejected'", 400)
  }

  const registration = await SocialProjectRegistration.findById(req.params.id).populate("user", "fullName email")

  if (!registration) {
    return errorResponse(res, "Social project registration not found", 404)
  }

  // Load government profile and verify this registration belongs to their city
  const Government = require("../models/Government")
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  if (registration.city?.toLowerCase() !== government.city?.toLowerCase()) {
    return errorResponse(res, "Cannot process a registration from a different city", 403)
  }

  if (registration.status !== "pending") {
    return errorResponse(res, "Registration has already been processed", 400)
  }

  registration.status = decision === "approved" ? "approved" : "rejected"
  registration.approvedBy = req.user._id
  registration.approvedAt = new Date()

  if (decision === "rejected") {
    registration.rejectionReason = rejectionReason
  }

  if (approvalNotes) {
    registration.registrationNotes = approvalNotes
  }

  await registration.save()

  const emailTemplate = decision === "approved" ? "socialProjectApproved" : "socialProjectRejected"
  const emailSubject =
    decision === "approved"
      ? "Your Social Project Registration is Approved"
      : "Your Social Project Registration is Rejected"

  // TODO: Implement email sending
  // await sendEmail({
  //   to: registration.user.email,
  //   subject: emailSubject,
  //   template: emailTemplate,
  //   data: {
  //     name: registration.user.fullName,
  //     projectTypes: registration.allowedProjectTypes.join(", "),
  //     rejectionReason: decision === "rejected" ? rejectionReason : undefined,
  //     approvalNotes,
  //   },
  // })

  successResponse(res, `Social project registration ${decision} successfully`, { registration })
})

// @desc    Create a new project (only after registration approval)
// @route   POST /api/social-projects/create
// @access  Private (Social Project users with approved registration only)
const createProject = asyncHandler(async (req, res) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return errorResponse(res, "Validation failed", 400, errors.array())
  }

  if (req.user.userType !== "social_project") {
    return errorResponse(res, "Only social project users can create projects", 403)
  }

  // Get user's social project registration (if exists)
  const registration = await SocialProjectRegistration.findOne({
    user: req.user._id,
  })

  // User must have submitted project registration before creating projects
  if (!registration) {
    return errorResponse(res, "You must submit a project registration first before creating projects", 403)
  }

  // Registration must be approved by government before creating projects
  if (registration.status !== "approved") {
    return errorResponse(res, "Your registration must be approved by government before creating projects. Current status: " + registration.status, 403)
  }

  const {
    projectTitle,
    projectType,
    state,
    city,
    country,
    projectDescription,
    startDate,
    endDate,
    representativeName,
    email,
    fundingGoal, // Accept funding goal from frontend
  } = req.body

  // Check if user is allowed to create this project type (if registration exists)
  if (registration && registration.allowedProjectTypes && !registration.allowedProjectTypes.includes(projectType)) {
    return errorResponse(
      res,
      `You are not authorized to create projects of type "${projectType}". Allowed types: ${registration.allowedProjectTypes.join(", ")}`,
      403,
    )
  }

  const documentation = []
  if (req.files && req.files.length > 0) {
    for (const file of req.files) {
      try {
        const result = await localStorageService.uploadFile(file.buffer, {
          folder: `municipality/projects/${Date.now()}/documents`,
          originalName: file.originalname,
          mimetype: file.mimetype,
          public_id: `proj_doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`,
        })

        const fileUrl = result.secure_url || result.url
        console.log("[v0] Project document uploaded:", {
          originalName: file.originalname,
          fileUrl,
        })

        documentation.push({
          fileName: file.originalname,
          fileUrl: fileUrl,
          fileType: file.mimetype,
          uploadedAt: new Date(),
        })
      } catch (error) {
        console.error("[v0] Project file upload error:", error)
        return errorResponse(res, "Failed to upload project document", 500)
      }
    }
  }

  const newProject = {
    projectTitle,
    projectType,
    // Always inherit city/state/country from the approved registration so the
    // government's city-scoped query always finds these projects
    state: registration.state,
    city: registration.city,
    country: registration.country,
    projectDescription,
    startDate,
    endDate,
    contactInfo: {
      representativeName,
      email,
    },
    documentation,
    projectStatus: "pending_approval", // NOT active — requires government approval
    publishedAt: new Date(),
    fundingGoal: 0,  // Set by government during project approval
    allocationSet: false,
    tokensFunded: 0,
  }

  registration.projects.push(newProject)
  await registration.save()

  const createdProject = registration.projects[registration.projects.length - 1]

  successResponse(res, "Project submitted for government approval. It will be visible to citizens once approved.", {
    project: createdProject,
    registration,
  })
})

// @desc    Get all projects created by the current user
// @route   GET /api/social-projects/my-projects
// @access  Private (Social Project users only)
const getMyProjects = asyncHandler(async (req, res) => {
  if (req.user.userType !== "social_project") {
    return errorResponse(res, "Only social project users can view their projects", 403)
  }

  const registration = await SocialProjectRegistration.findOne({ user: req.user._id }).select(
    "projects projectOrganizationName allowedProjectTypes state",
  )

  if (!registration) {
    return errorResponse(res, "No registration found", 404)
  }

  const projects = registration.projects.map((project) => ({
    ...(project.toObject ? project.toObject() : project),
    registrationId: registration._id,
    organizationName: registration.projectOrganizationName,
    registrationState: registration.state,
    documentation: formatDocumentation(project.documentation),
  }))

  successResponse(res, "User projects retrieved successfully", projects)
})

// @desc    Get registration statistics (Government only)
// @route   GET /api/social-projects/registrations/stats
// @access  Private (Government only)
const getRegistrationStats = asyncHandler(async (req, res) => {
  if (req.user.userType !== "government") {
    return errorResponse(res, "Only government users can view statistics", 403)
  }

  const stats = await SocialProjectRegistration.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ])

  const totalRegistrations = await SocialProjectRegistration.countDocuments()
  const pendingCount = await SocialProjectRegistration.countDocuments({ status: "pending" })
  const approvedCount = await SocialProjectRegistration.countDocuments({ status: "approved" })

  successResponse(res, "Registration statistics retrieved successfully", {
    stats,
    totalRegistrations,
    pendingCount,
    approvedCount,
  })
})

// @desc    Get active projects for citizens (city scoped)
// @route   GET /api/social-projects/citizen/my-city
// @access  Private (Citizen only)

const getApprovedProjectsByCity = asyncHandler(async (req, res) => {
  if (req.user.userType !== "citizen") {
    return errorResponse(res, "Only citizen users can access this endpoint", 403)
  }

  const { page = 1, limit = 10, projectType } = req.query
  const skip = (page - 1) * limit

  const userCity = req.user.city?.trim()

  if (!userCity) {
    return errorResponse(res, "Your profile is missing a city. Please update your profile before viewing city projects.", 400)
  }

  // Fetch ALL projects from same city regardless of projectStatus.
  // Citizens can VIEW unapproved projects — token support is blocked inside supportProjectWithTokens.
  // Only require the registration itself to be government-approved (status:"approved").
  const query = {
    status: "approved",
    city: { $regex: new RegExp(`^${userCity}$`, "i") },
  }

  if (projectType) {
    query["projects.projectType"] = projectType
  }

  const registrations = await SocialProjectRegistration.find(query)
    .populate("user", "fullName email avatar")
    .select("projectOrganizationName city state country projects user")
    .lean()

  let projects = []

  registrations.forEach((registration) => {
    const filteredProjects = registration.projects
      .filter((project) => {
        if (projectType && project.projectType !== projectType) return false
        return true
      })
      .map((project) => ({
        _id: project._id,
        projectTitle: project.projectTitle,
        projectType: project.projectType,
        state: project.state || registration.state,
        city: project.city || registration.city,
        country: project.country || registration.country,
        projectDescription: project.projectDescription,
        contactInfo: project.contactInfo,
        documentation: formatDocumentation(project.documentation),
        organizationName: registration.projectOrganizationName,
        organizationCity: registration.city,
        organizationState: registration.state,
        createdBy: registration.user,
        registrationId: registration._id,
        projectStatus: project.projectStatus,   // "pending_approval" | "active" — citizen can see both
        canSupport: project.projectStatus === "active", // frontend uses this to show/hide support button
        fundingGoal: project.fundingGoal,
        tokensFunded: project.tokensFunded,
        createdAt: project.publishedAt,
      }))

    projects.push(...filteredProjects)
  })

  const total = projects.length
  const paginatedProjects = projects.slice(skip, skip + Number(limit))

  const pagination = {
    currentPage: Number(page),
    totalPages: Math.ceil(total / limit),
    totalProjects: total,
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  }

  successResponse(res, "Projects in your city retrieved successfully", {
    projects: paginatedProjects,
    pagination,
  })
})

// @desc    Get all active projects created by social users (PUBLIC - No Auth Required)
// @route   GET /api/social-projects/public/active
// @access  Public
const getActiveProjectsPublic = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, projectType, state, city, country, search } = req.query
  const skip = (page - 1) * limit

  // Build base filter — only government-approved registrations
  const filter = {
    status: "approved",
  }

  // Build $elemMatch for filtering projects array — NO projectStatus filter here.
  // All projects from approved registrations are visible; token support is blocked per-project inside supportProjectWithTokens.
  const projectElemMatch = {}

  // CITIZEN: auto-filter by their city
  if (req.user && req.user.userType === "citizen" && req.user.city) {
    filter.city = { $regex: new RegExp(`^${req.user.city.trim()}$`, "i") }
  } else {
    // NON-CITIZEN: use optional query params
    if (city) {
      filter.city = { $regex: new RegExp(`^${city.trim()}$`, "i") }
    }
    if (state) {
      projectElemMatch.state = { $regex: new RegExp(`^${state}$`, "i") }
    }
    if (country) {
      projectElemMatch.country = { $regex: new RegExp(`^${country}$`, "i") }
    }
  }

  if (projectType) {
    projectElemMatch.projectType = projectType
  }

  // Only add $elemMatch if we have project-level filters
  if (Object.keys(projectElemMatch).length > 0) {
    filter.projects = { $elemMatch: projectElemMatch }
  }

  // Fetch registrations matching filter
  const [registrations, total] = await Promise.all([
    SocialProjectRegistration.find(filter)
      .populate("user", "fullName email avatar")
      .select("projectOrganizationName city country state projects user")
      .sort({ "projects.publishedAt": -1 })
      .skip(skip)
      .limit(Number.parseInt(limit))
      .lean(),
    SocialProjectRegistration.countDocuments(filter),
  ])

  // Extract and format all projects — citizens can see pending_approval too; token support blocked separately
  const projects = registrations.flatMap((registration) =>
    registration.projects
      .map((project) => ({
        _id: project._id,
        projectTitle: project.projectTitle,
        projectType: project.projectType,
        state: project.state || registration.state,
        city: project.city || registration.city,
        country: project.country || registration.country,
        projectDescription: project.projectDescription,
        contactInfo: project.contactInfo,
        documentation: formatDocumentation(project.documentation),
        organizationName: registration.projectOrganizationName,
        organizationCity: registration.city,
        organizationState: registration.state,
        createdBy: registration.user,
        registrationId: registration._id,
        projectStatus: project.projectStatus,
        canSupport: project.projectStatus === "active",
        fundingGoal: project.fundingGoal,
        tokensFunded: project.tokensFunded,
        createdAt: project.publishedAt,
      })),
  )

  const pagination = {
    currentPage: Number.parseInt(page),
    totalPages: Math.ceil(total / limit),
    totalProjects: projects.length,
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  }

  successResponse(res, "Active projects retrieved successfully", {
    projects,
    pagination,
  })
})

// @desc    Get single project details with documentation (PUBLIC - No Auth Required)
// @route   GET /api/social-projects/public/:projectId
// @access  Public
const getProjectDetailsPublic = asyncHandler(async (req, res) => {
  const { projectId } = req.params

  const query = {
    "projects._id": projectId,
  }

  const registration = await SocialProjectRegistration.findOne(query).populate("user", "fullName email avatar").lean()

  if (!registration) {
    return errorResponse(res, "Project not found", 404)
  }

  const project = registration.projects.find((p) => p._id.toString() === projectId)

  if (!project) {
    return errorResponse(res, "Project not found", 404)
  }

  const allocationLimit = await AllocationLimit.findOne({
    project: projectId,
    projectRegistration: registration._id,
    status: "active",
  })

  const projectDetails = {
    _id: project._id,
    projectTitle: project.projectTitle,
    projectType: project.projectType,
    state: project.state,
    city: project.city,
    country: project.country,
    projectDescription: project.projectDescription,
    startDate: project.startDate,
    endDate: project.endDate,
    contactInfo: project.contactInfo,
    documentation: formatDocumentation(project.documentation),
    status: project.projectStatus,
    publishedAt: project.publishedAt,
    fundingGoal: project.fundingGoal,
    tokensFunded: project.tokensFunded,
    allocationSet: project.allocationSet,
    fundingProgress: project.fundingGoal > 0 ? Math.round((project.tokensFunded / project.fundingGoal) * 100) : 0,
    citizenTokenLimit: allocationLimit?.citizenTokenLimit || null,
    remainingFundingNeeded: Math.max(0, project.fundingGoal - project.tokensFunded),
    isFullyFunded: project.tokensFunded >= project.fundingGoal,
    organizationName: registration.projectOrganizationName,
    organizationCity: registration.city,
    organizationState: registration.state,
    createdBy: registration.user
      ? {
          _id: registration.user._id,
          fullName: registration.user.fullName,
          email: registration.user.email,
          avatar: registration.user.avatar,
        }
      : null,
  }

  successResponse(res, "Project details retrieved successfully", projectDetails)
})

// @desc    Support a project by spending tokens
// @route   POST /api/social-projects/:projectId/support
// @access  Private (Citizen users only)
const supportProjectWithTokens = asyncHandler(async (req, res) => {
  const { projectId } = req.params
  const { tokensToSpend } = req.body

  if (req.user.userType !== "citizen") {
    return errorResponse(res, "Only citizen users can support projects", 403)
  }

  if (!tokensToSpend || tokensToSpend <= 0) {
    return errorResponse(res, "Tokens to spend must be greater than 0", 400)
  }

  if (req.user.tokenBalance < tokensToSpend) {
    return errorResponse(res, `Insufficient tokens. You have ${req.user.tokenBalance} tokens available`, 400)
  }

  const registration = await SocialProjectRegistration.findOne({
    status: "approved",
    "projects._id": projectId,
    // City-based isolation: only citizens from the same city can contribute
    city: { $regex: new RegExp(`^${req.user.city?.trim()}$`, "i") },
  })

  if (!registration) {
    return errorResponse(
      res,
      "Project not found or not available in your city. Only citizens from the project's city can contribute.",
      404,
    )
  }

  const projectIndex = registration.projects.findIndex((p) => p._id.toString() === projectId)

  if (projectIndex === -1 || registration.projects[projectIndex].projectStatus !== "active") {
    return errorResponse(res, "Project not found or is not active", 404)
  }

  const project = registration.projects[projectIndex]

  if (!project.allocationSet || project.fundingGoal === 0) {
    return errorResponse(res, "Project allocation has not been configured yet by the government", 400)
  }

  const allocationLimit = await AllocationLimit.findOne({
    projectRegistration: registration._id,
    project: projectId,
    status: "active",
  })

  if (!allocationLimit) {
    return errorResponse(res, "Project allocation limit not found. Please contact support.", 400)
  }

  if (project.tokensFunded >= project.fundingGoal) {
    return errorResponse(res, `Project has reached its funding goal of ${project.fundingGoal} tokens`, 400)
  }

  const existingSupport = project.supportedBy.find((s) => s.userId.toString() === req.user._id.toString())

  if (existingSupport) {
    const totalTokens = existingSupport.tokensSpent + tokensToSpend
    if (totalTokens > allocationLimit.citizenTokenLimit) {
      return errorResponse(
        res,
        `Cannot support with ${tokensToSpend} tokens. Your limit is ${allocationLimit.citizenTokenLimit} tokens per project. You have already spent ${existingSupport.tokensSpent} tokens.`,
        400,
      )
    }
  } else {
    if (tokensToSpend > allocationLimit.citizenTokenLimit) {
      return errorResponse(
        res,
        `Cannot support with ${tokensToSpend} tokens. Your limit is ${allocationLimit.citizenTokenLimit} tokens per project.`,
        400,
      )
    }
  }

  const newFundedAmount = project.tokensFunded + tokensToSpend
  if (newFundedAmount > project.fundingGoal) {
    return errorResponse(
      res,
      `Cannot support with ${tokensToSpend} tokens. Project only needs ${project.fundingGoal - project.tokensFunded} more tokens to reach its goal.`,
      400,
    )
  }

  const supportId = generateUniqueId("SUP")

  const supportRecord = await ProjectSupport.create({
    supportId,
    citizen: req.user._id,
    project: projectId,
    projectRegistration: registration._id,
    tokensSpent: tokensToSpend,
    supportedAt: new Date(),
  })

  req.user.tokenBalance -= tokensToSpend

  if (existingSupport) {
    existingSupport.tokensSpent += tokensToSpend
  } else {
    project.supportedBy.push({
      userId: req.user._id,
      tokensSpent: tokensToSpend,
      supportedAt: new Date(),
    })
  }

  project.tokensFunded += tokensToSpend

  req.user.tokenSupportedProjects.push({
    project: projectId,
    tokensSpent: tokensToSpend,
    supportedAt: new Date(),
  })

  const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  await TokenTransaction.create({
    transactionId,
    transactionType: "spend",
    fromUser: req.user._id,
    toUser: registration.user._id,
    amount: tokensToSpend,
    tokenType: "civic",
    relatedProject: projectId,
    status: "completed",
    description: `Supported project: ${project.projectTitle}`,
    category: "contribution",
    processedAt: new Date(),
  })

  await User.findByIdAndUpdate(registration.user._id, {
    $inc: { tokenBalance: tokensToSpend },
  })

  await Promise.all([req.user.save(), registration.save()])

  const response = {
    success: true,
    message: `Successfully supported ${project.projectTitle} with ${tokensToSpend} tokens`,
    transaction: {
      transactionId,
      supportId,
      projectId,
      projectTitle: project.projectTitle,
      tokensSpent: tokensToSpend,
      newUserBalance: req.user.tokenBalance,
      projectFundingProgress: {
        tokensFunded: project.tokensFunded,
        fundingGoal: project.fundingGoal,
        percentageFunded: Math.round((project.tokensFunded / project.fundingGoal) * 100),
        remainingNeeded: Math.max(0, project.fundingGoal - project.tokensFunded),
        isFullyFunded: project.tokensFunded >= project.fundingGoal,
      },
      supportedAt: new Date(),
    },
  }

  successResponse(res, response.message, response, 200)
})

// @desc    Get project funding details
// @route   GET /api/social-projects/:projectId/funding
// @access  Public
const getProjectFundingDetails = asyncHandler(async (req, res) => {
  const { projectId } = req.params

  const registration = await SocialProjectRegistration.findOne({
    status: "approved",
    "projects._id": projectId,
  })
    .populate("projects.supportedBy.userId", "fullName avatar")
    .lean()

  if (!registration) {
    return errorResponse(res, "Project not found", 404)
  }

  const project = registration.projects.find((p) => p._id.toString() === projectId)

  if (!project || project.status !== "active") {
    return errorResponse(res, "Project not found or is not active", 404)
  }

  const allocationLimit = await AllocationLimit.findOne({
    project: projectId,
    status: "active",
  })

  const fundingDetails = {
    projectId: project._id,
    projectTitle: project.projectTitle,
    projectTokenLimit: allocationLimit?.projectTokenLimit || null,
    tokensFunded: project.tokensFunded,
    percentageFunded: allocationLimit
      ? Math.round((project.tokensFunded / allocationLimit.projectTokenLimit) * 100)
      : 0,
    supportersCount: project.supportedBy.length,
    supporters: project.supportedBy.map((support) => ({
      userId: support.userId._id,
      userName: support.userId.fullName,
      userAvatar: support.userId.avatar,
      tokensSpent: support.tokensSpent,
      supportedAt: support.supportedAt,
    })),
    remainingTokensNeeded: allocationLimit
      ? Math.max(0, allocationLimit.projectTokenLimit - project.tokensFunded)
      : null,
  }

  successResponse(res, "Project funding details retrieved successfully", fundingDetails)
})

// @desc    Update project (only title, description, and media)
// @route   PUT /api/social-projects/:projectId/update
// @access  Private (Social Project users only - project owner)
const updateProject = asyncHandler(async (req, res) => {
    
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return errorResponse(res, "Validation failed", 400, errors.array())
  }


  if (req.user.userType !== "social_project") {
    return errorResponse(res, "Only social project users can update projects", 403)
  }

  const { projectId } = req.params
  const { projectTitle, projectDescription,documentation } = req.body

  const registration = await SocialProjectRegistration.findOne({
    user: req.user._id,
    "projects._id": projectId,
  })
 
  // console.log("registration",registration)
  if (!registration) {
    return errorResponse(res, "Project not found or you don't have permission to update it", 404)
  }

  const projectIndex = registration.projects.findIndex((p) => p._id.toString() === projectId)

  if (projectIndex === -1) {
    return errorResponse(res, "Project not found", 404)
  }

  const project = registration.projects[projectIndex]

  if (projectTitle) {
    project.projectTitle = projectTitle
  }

  if (projectDescription) {
    project.projectDescription = projectDescription
  }

  if (req.files && req.files.length > 0) {
    const newDocumentation = []
    for (const file of req.files) {
      try {
        const result = await localStorageService.uploadFile(file.buffer, {
          folder: `municipality/projects/${registration._id}/documents`,
          originalName: file.originalname,
          mimetype: file.mimetype,
          public_id: `proj_doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`,
        })

        const fileUrl = result.secure_url || result.url
        console.log("[v0] Project update documentation uploaded:", {
          originalName: file.originalname,
          fileUrl,
        })

        newDocumentation.push({
          fileName: file.originalname,
          fileUrl: fileUrl,
          fileType: file.mimetype,
          uploadedAt: new Date(),
        })
      } catch (error) {
        console.error("[v0] Project file upload error during update:", error)
        return errorResponse(res, "Failed to upload documentation", 500)
      }
    }

    project.documentation = newDocumentation
  }

  await registration.save()

  const updatedProject = {
    _id: project._id,
    projectTitle: project.projectTitle,
    projectDescription: project.projectDescription,
    documentation: formatDocumentation(project.documentation),
    updatedAt: new Date(),
  }

  successResponse(res, "Project updated successfully", updatedProject, 200)
})

// @desc    Get all pending projects awaiting approval (Government only)
// @route   GET /api/social-projects/pending-approval
// @access  Private (Government only)
const getPendingProjectsApproval = asyncHandler(async (req, res) => {
  if (req.user.userType !== "government") {
    return errorResponse(res, "Only government users can view pending projects", 403)
  }

  const { page = 1, limit = 10 } = req.query
  const skip = (page - 1) * limit

  // Load Government profile to get the authoritative city
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  console.log("[v0] getPendingProjectsApproval - government city:", government.city)

  // Only approved registrations from this city that have pending_approval projects
  const query = {
    status: "approved",
    city: { $regex: new RegExp(`^${government.city.trim()}$`, "i") },
    "projects.projectStatus": "pending_approval",
  }

  const [registrations, total] = await Promise.all([
    SocialProjectRegistration.find(query)
      .populate("user", "fullName email")
      .lean(),
    SocialProjectRegistration.countDocuments(query),
  ])

  const projects = registrations.flatMap((registration) =>
    registration.projects
      .filter((project) => project.projectStatus === "pending_approval")
      .map((project) => ({
        _id: project._id,
        projectTitle: project.projectTitle,
        projectType: project.projectType,
        state: project.state,
        city: project.city,
        country: project.country,
        projectDescription: project.projectDescription,
        documentation: formatDocumentation(project.documentation),
        organizationName: registration.projectOrganizationName,
        organizationCity: registration.city,
        organizationState: registration.state,
        createdBy: registration.user,
        registrationId: registration._id,
        projectStatus: project.projectStatus,
        createdAt: project.publishedAt,
      })),
  )

  console.log("[v0] getPendingProjectsApproval - found:", projects.length, "pending projects")

  const pagination = {
    currentPage: Number.parseInt(page),
    totalPages: Math.ceil(total / limit),
    totalProjects: projects.length,
    hasNext: page < Math.ceil(total / limit),
    hasPrev: page > 1,
  }

  successResponse(res, "Pending projects retrieved successfully", {
    projects,
    pagination,
  })
})

// @desc    Approve or reject a project WITH TOKEN ALLOCATION (Government only)
// @route   PUT /api/social-projects/:projectId/approve
// @access  Private (Government only)
const approveProjectDecision = asyncHandler(async (req, res) => {
  if (req.user.userType !== "government") {
    return errorResponse(res, "Only government users can approve projects", 403)
  }

  // projectId is the subdocument _id inside registration.projects[]
  const projectId = req.params.projectId
  const { decision, rejectionReason, fundingGoal, citizenTokenLimit } = req.body

  if (!decision || !["active", "rejected"].includes(decision)) {
    return errorResponse(res, "Decision must be 'active' or 'rejected'", 400)
  }

  if (decision === "active") {
    if (!fundingGoal || fundingGoal <= 0) {
      return errorResponse(res, "Funding goal is required and must be greater than 0", 400)
    }
    if (!citizenTokenLimit || citizenTokenLimit <= 0) {
      return errorResponse(res, "Citizen token limit is required and must be greater than 0", 400)
    }
    if (citizenTokenLimit > fundingGoal) {
      return errorResponse(res, "Citizen token limit cannot exceed funding goal", 400)
    }
  }

  // Load government profile to get authoritative city
  const government = await Government.findOne({ userId: req.user._id })
  if (!government) {
    return errorResponse(res, "Government profile not found", 404)
  }

  // Find the registration that contains this project subdocument
  // The registration must be approved AND in the government's city
  const registration = await SocialProjectRegistration.findOne({
    status: "approved",
    "projects._id": projectId,
    city: { $regex: new RegExp(`^${government.city.trim()}$`, "i") },
  }).populate("user", "fullName email")

  if (!registration) {
    return errorResponse(
      res,
      "Project not found, or the registration is not approved, or it belongs to a different city",
      404,
    )
  }

  const projectIndex = registration.projects.findIndex((p) => p._id.toString() === projectId)

  if (projectIndex === -1) {
    return errorResponse(res, "Project not found in registration", 404)
  }

  const project = registration.projects[projectIndex]

  if (project.projectStatus !== "pending_approval") {
    return errorResponse(res, `Project has already been processed (current status: ${project.projectStatus})`, 400)
  }

  project.projectStatus = decision
  project.approvedBy = req.user._id
  project.approvedAt = new Date()

  if (decision === "rejected") {
    project.rejectionReason = rejectionReason
  } else if (decision === "active") {
    project.fundingGoal = fundingGoal
    project.allocationSet = true
    project.tokensFunded = 0
  }

  await registration.save()

  if (decision === "active") {
    const existingAllocation = await AllocationLimit.findOne({
      project: projectId,
      projectRegistration: registration._id,
    })

    if (existingAllocation) {
      existingAllocation.projectTokenLimit = fundingGoal
      existingAllocation.citizenTokenLimit = citizenTokenLimit
      existingAllocation.setBy = req.user._id
      existingAllocation.setAt = new Date()
      existingAllocation.status = "active"
      await existingAllocation.save()
    } else {
      await AllocationLimit.create({
        projectRegistration: registration._id,
        project: projectId,
        citizenTokenLimit,
        projectTokenLimit: fundingGoal,
        setBy: req.user._id,
        setAt: new Date(),
        status: "active",
        notes: `Allocation set during project approval`,
      })
    }
  }

  // TODO: Send email notification to project creator
  // const emailTemplate = decision === "active" ? "projectApproved" : "projectRejected"
  // await sendEmail({
  //   to: registration.user.email,
  //   subject: `Your Project "${project.projectTitle}" is ${decision === 'active' ? 'Approved' : 'Rejected'}`,
  //   template: emailTemplate,
  //   data: {
  //     name: registration.user.fullName,
  //     projectTitle: project.projectTitle,
  //     fundingGoal: decision === 'active' ? fundingGoal : undefined,
  //     rejectionReason: decision === "rejected" ? rejectionReason : undefined,
  //   },
  // })

  successResponse(res, `Project ${decision === "active" ? "approved and allocated" : "rejected"} successfully`, {
    project: {
      _id: project._id,
      projectTitle: project.projectTitle,
      projectStatus: project.projectStatus,
      fundingGoal: decision === "active" ? fundingGoal : undefined,
      approvedAt: project.approvedAt,
    },
  })
})

module.exports = {
  submitSocialProjectRegistration,
  getMyRegistration,
  getPendingRegistrations,
  processSocialProjectDecision,
  createProject,
  getMyProjects,
  getRegistrationStats,
  getAllProjects,
  getApprovedProjectsByCity,
  getActiveProjectsPublic,
  getProjectDetailsPublic,
  supportProjectWithTokens,
  getProjectFundingDetails,
  updateProject,
  getPendingProjectsApproval,
  approveProjectDecision,
}
