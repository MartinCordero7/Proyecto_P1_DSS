const multer = require('multer');
const path = require('path');
const config = require('../config');
const fileStorageService = require('../services/fileStorage.service');
const {
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  BadRequestError
} = require('../utils/errors');

// Configure Multer disk storage to stream file directly to temporary folder
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.storage.tempDir);
  },
  filename: (req, file, cb) => {
    // Determine client extension to preserve format hint for internal temp file
    const ext = path.extname(file.originalname || '').toLowerCase();
    // Use cryptographically random UUID name to prevent collision and path traversal
    const internalName = fileStorageService.generateInternalFilename(ext);
    cb(null, internalName);
  }
});

// Initial pre-filter to reject disallowed extensions before full buffering
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  
  if (!config.imageLimits.allowedExtensions.includes(ext)) {
    return cb(
      new UnsupportedMediaTypeError(
        `Disallowed file extension '${ext}'. Only .png and .bmp extensions are accepted.`,
        'DISALLOWED_EXTENSION'
      ),
      false
    );
  }

  cb(null, true);
};

// Create Multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.imageLimits.maxSizeBytes,
    files: 1
  }
});

/**
 * Middleware wrapper for upload.single('image')
 * Catches Multer-specific errors and transforms them into standard AppErrors.
 */
function handleImageUpload(req, res, next) {
  const uploadSingle = upload.single('image');

  uploadSingle(req, res, (err) => {
    if (!err) {
      if (!req.file) {
        return next(new BadRequestError('No image file was received. Field "image" is required.', 'IMAGE_FIELD_MISSING'));
      }
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new PayloadTooLargeError(
            `File size exceeds maximum allowed limit of ${config.imageLimits.maxSizeBytes} bytes`,
            'FILE_SIZE_LIMIT_EXCEEDED'
          )
        );
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(
          new BadRequestError(
            `Unexpected field '${err.field}'. Expected form field name 'image'`,
            'UNEXPECTED_FIELD'
          )
        );
      }
      return next(new BadRequestError(`Upload error: ${err.message}`, 'UPLOAD_ERROR'));
    }

    // Pass custom errors (like UnsupportedMediaTypeError from fileFilter)
    next(err);
  });
}

module.exports = {
  handleImageUpload
};

