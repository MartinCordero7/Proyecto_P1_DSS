const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const steganographyRoutes = require('./routes/steganography.routes');
const errorHandler = require('./middlewares/error.middleware');
const accessLog = require('./middlewares/accessLog.middleware');
const { BadRequestError } = require('./utils/errors');

const app = express();

// Secure HTTP headers
app.use(helmet());

// Access audit log (no headers or bodies, so JWTs never reach the logs)
app.use(accessLog);

// Cross-Origin Resource Sharing
app.use(cors());

// Parse application/json with safe payload size limit
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'stego-ms',
    timestamp: new Date().toISOString()
  });
});

// Steganography API Routes
app.use('/api/steganography', steganographyRoutes);

// Catch-all for undefined routes
app.use((req, res, next) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist`
    }
  });
});

// Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;

