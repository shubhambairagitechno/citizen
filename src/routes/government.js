// // const express = require("express")
// // const {
// //   registerGovernmentStep1,
// //   registerGovernmentStep2,
// //   getGovernmentProfile,
// //   updateGovernmentProfile,
// // } = require("../controllers/governmentController")
// // const { protect, authorize } = require("../middleware/auth")
// // const {
// //   governmentRegisterStep1Validation,
// //   governmentRegisterStep2Validation,
// // } = require("../validators/governmentValidators")
// // const { handleValidationErrors } = require("../middleware/validation")

// // const router = express.Router()

// // // Two-step registration (public)
// // router.post("/register/step-1", governmentRegisterStep1Validation, handleValidationErrors, registerGovernmentStep1)
// // router.put("/register/step-2/:id", governmentRegisterStep2Validation, handleValidationErrors, registerGovernmentStep2)

// // // Profile (requires government user)
// // router.get("/profile", protect, authorize("government"), getGovernmentProfile)
// // router.put("/profile", protect, authorize("government"), updateGovernmentProfile)

// // module.exports = router


// const express = require("express")
// const {
//   registerGovernmentStep1,
//   registerGovernmentStep2,
//   getGovernmentProfile,
//   updateGovernmentProfile,
//   getPendingCitizenRegistrations,
//   getPendingSocialProjectRegistrations,
//   approveCitizenRegistration,
//   rejectCitizenRegistration,
//   approveSocialProjectRegistration,
//   rejectSocialProjectRegistration,
//   getPendingTokenClaims,
//   approveTokenClaim,
//   rejectTokenClaim,
//   issueTokens,
//   transferTokens,
//   getPendingFundRequests,
//   approveFundRequest,
//   rejectFundRequest,
//   getGovernmentAuditLogs,
// } = require("../controllers/governmentController")
// const { protect, authorize } = require("../middleware/auth")
// const {
//   governmentRegisterStep1Validation,
//   governmentRegisterStep2Validation,
// } = require("../validators/governmentValidators")
// const { handleValidationErrors } = require("../middleware/validation")

// const router = express.Router()

// // Two-step registration (public)
// router.post("/register/step-1", governmentRegisterStep1Validation, handleValidationErrors, registerGovernmentStep1)
// router.put("/register/step-2/:id", governmentRegisterStep2Validation, handleValidationErrors, registerGovernmentStep2)

// // Profile (requires government user)
// router.get("/profile", protect, authorize("government"), getGovernmentProfile)
// router.put("/profile", protect, authorize("government"), updateGovernmentProfile)

// // Registration Reviews
// router.get("/registrations/citizens", protect, authorize("government"), getPendingCitizenRegistrations)
// router.get("/registrations/projects", protect, authorize("government"), getPendingSocialProjectRegistrations)
// router.post(
//   "/registrations/citizens/:registrationId/approve",
//   protect,
//   authorize("government"),
//   approveCitizenRegistration,
// )
// router.post(
//   "/registrations/citizens/:registrationId/reject",
//   protect,
//   authorize("government"),
//   rejectCitizenRegistration,
// )
// router.post(
//   "/registrations/projects/:projectId/approve",
//   protect,
//   authorize("government"),
//   approveSocialProjectRegistration,
// )
// router.post(
//   "/registrations/projects/:projectId/reject",
//   protect,
//   authorize("government"),
//   rejectSocialProjectRegistration,
// )

// // Token Claim Reviews
// router.get("/token-claims", protect, authorize("government"), getPendingTokenClaims)
// router.post("/token-claims/:claimId/approve", protect, authorize("government"), approveTokenClaim)
// router.post("/token-claims/:claimId/reject", protect, authorize("government"), rejectTokenClaim)

// // Manual Token Operations
// router.post("/tokens/issue", protect, authorize("government"), issueTokens)
// router.post("/tokens/transfer", protect, authorize("government"), transferTokens)

// // Fund Request Reviews
// router.get("/fund-requests", protect, authorize("government"), getPendingFundRequests)
// router.post("/fund-requests/:fundRequestId/approve", protect, authorize("government"), approveFundRequest)
// router.post("/fund-requests/:fundRequestId/reject", protect, authorize("government"), rejectFundRequest)

// // Audit Logs
// router.get("/audit-logs", protect, authorize("government"), getGovernmentAuditLogs)

// module.exports = router


const express = require("express")
const {
  registerGovernmentStep1,
  registerGovernmentStep2,
  getGovernmentProfile,
  updateGovernmentProfile,
  getPendingCitizenRegistrations,
  approveCitizen,
  rejectCitizen,
  getPendingSocialProjectRegistrations,
  approveSocialProjectRegistration,
  rejectSocialProjectRegistration,
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
} = require("../controllers/governmentController")
const { protect, authorize } = require("../middleware/auth")
const {
  governmentRegisterStep1Validation,
  governmentRegisterStep2Validation,
} = require("../validators/governmentValidators")
const { handleValidationErrors } = require("../middleware/validation")

const router = express.Router()

// Two-step registration (public)
router.post("/register/step-1", governmentRegisterStep1Validation, handleValidationErrors, registerGovernmentStep1)
router.put("/register/step-2/:id", governmentRegisterStep2Validation, handleValidationErrors, registerGovernmentStep2)

// Profile (requires government user)
router.get("/profile", protect, authorize("government"), getGovernmentProfile)
router.put("/profile", protect, authorize("government"), updateGovernmentProfile)

// Citizen Approval for Token Operations
router.get("/registrations/citizens", protect, authorize("government"), getPendingCitizenRegistrations)
router.post("/citizens/:citizenId/approve", protect, authorize("government"), approveCitizen)
router.post("/citizens/:citizenId/reject", protect, authorize("government"), rejectCitizen)

// Social Project Registration Reviews — approve/reject the REGISTRATION (org-level)
// To approve individual projects use: PUT /api/social-projects/:projectId/approve
router.get("/registrations/projects", protect, authorize("government"), getPendingSocialProjectRegistrations)
router.post(
  "/registrations/projects/:projectId/approve",
  protect,
  authorize("government"),
  approveSocialProjectRegistration,
)
router.post(
  "/registrations/projects/:projectId/reject",
  protect,
  authorize("government"),
  rejectSocialProjectRegistration,
)

// Token Claim Reviews
router.get("/token-claims", protect, authorize("government"), getPendingTokenClaims)
router.post("/token-claims/:claimId/approve", protect, authorize("government"), approveTokenClaim)
router.post("/token-claims/:claimId/reject", protect, authorize("government"), rejectTokenClaim)

// Token Request Reviews
router.get("/token-requests", protect, authorize("government"), getPendingTokenRequests)
router.post("/token-requests/:tokenRequestId/approve", protect, authorize("government"), approveTokenRequest)
router.post("/token-requests/:tokenRequestId/reject", protect, authorize("government"), rejectTokenRequest)

// Manual Token Operations/
router.post("/tokens/issue", protect, authorize("government"), issueTokens)
router.post("/tokens/transfer", protect, authorize("government"), transferTokens)

// Fund Request Reviews
router.get("/fund-requests", protect, authorize("government"), getPendingFundRequests)
router.post("/fund-requests/:fundRequestId/approve", protect, authorize("government"), approveFundRequest)
router.post("/fund-requests/:fundRequestId/reject", protect, authorize("government"), rejectFundRequest)

module.exports = router
