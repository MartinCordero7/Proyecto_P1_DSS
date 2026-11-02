const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables from .env if present
dotenv.config();

const rootDir = path.resolve(__dirname, '../../');

const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  storage: {
    tempDir: path.isAbsolute(process.env.STORAGE_TEMP_PATH || './storage/temporary')
      ? (process.env.STORAGE_TEMP_PATH || './storage/temporary')
      : path.resolve(rootDir, process.env.STORAGE_TEMP_PATH || './storage/temporary'),
    quarantineDir: path.isAbsolute(process.env.STORAGE_QUARANTINE_PATH || './storage/quarantine')
      ? (process.env.STORAGE_QUARANTINE_PATH || './storage/quarantine')
      : path.resolve(rootDir, process.env.STORAGE_QUARANTINE_PATH || './storage/quarantine'),
  },

  imageLimits: {
    maxSizeBytes: parseInt(process.env.MAX_FILE_SIZE_BYTES, 10) || 5 * 1024 * 1024, // 5 MB
    maxWidth: parseInt(process.env.MAX_IMAGE_WIDTH, 10) || 4096,
    maxHeight: parseInt(process.env.MAX_IMAGE_HEIGHT, 10) || 4096,
    allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'image/png,image/bmp')
      .split(',')
      .map(t => t.trim().toLowerCase()),
    allowedExtensions: ['.png', '.bmp']
  },

  auth: {
    baseUrl: process.env.AUTH_BASE_URL || 'http://localhost:3000',
    publicKeyPath: path.isAbsolute(process.env.AUTH_PUBLIC_KEY_PATH || './src/config/keys/auth_public_key.pem')
      ? (process.env.AUTH_PUBLIC_KEY_PATH || './src/config/keys/auth_public_key.pem')
      : path.resolve(rootDir, process.env.AUTH_PUBLIC_KEY_PATH || './src/config/keys/auth_public_key.pem'),
    publicKey: process.env.AUTH_PUBLIC_KEY || null,
    serviceCredential: process.env.AUTH_SERVICE_CREDENTIAL || '',
    timeoutMs: parseInt(process.env.AUTH_TIMEOUT, 10) || 5000,
  },

  jwt: {
    issuer: process.env.JWT_ISSUER || 'auth-ms',
    audience: process.env.JWT_AUDIENCE || 'stego-ms',
    algorithm: process.env.JWT_ALGORITHM || 'RS256'
  },

  getAuthPublicKey() {
    if (this.auth.publicKey) {
      return this.auth.publicKey;
    }
    if (this.auth.publicKeyPath && fs.existsSync(this.auth.publicKeyPath)) {
      return fs.readFileSync(this.auth.publicKeyPath, 'utf8');
    }
    return null;
  }
};

module.exports = config;

