const express = require('express');
const router = express.Router();
const steganographyController = require('../controllers/steganography.controller');
const { authenticateJwt, requireAuthorization } = require('../middlewares/auth.middleware');
const { handleImageUpload } = require('../middlewares/upload.middleware');

/**
 * @route POST /api/steganography/analyze
 * @desc Validates and analyzes an uploaded image for hidden steganographic data.
 * @access Protected (JWT + Active RBAC: ADMIN or ANALYST via AUTH)
 */
router.post(
  '/analyze',
  authenticateJwt,
  requireAuthorization('steganography.analyze'),
  handleImageUpload,
  (req, res, next) => steganographyController.analyze(req, res, next)
);

/**
 * @route GET /api/steganography/results/:id
 * @desc Retrieves an analysis result by ID, validating RBAC and resource ownership via AUTH.
 * @access Protected (JWT + Active RBAC & ownership check via AUTH)
 */
router.get(
  '/results/:id',
  authenticateJwt,
  requireAuthorization('steganography.view_result', req => req.params.id),
  (req, res, next) => steganographyController.getResult(req, res, next)
);

module.exports = router;

