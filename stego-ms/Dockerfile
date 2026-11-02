# ==========================================
# Dockerfile: STEGO Microservice (Persona 1)
# Secure by Design & CIS Docker Benchmark Compliant
# ==========================================

FROM node:22-alpine AS runtime

# Install dumb-init or curl for healthchecks
RUN apk add --no-cache curl dumb-init

# Set production environment
ENV NODE_ENV=production
ENV PORT=4000

# Set working directory
WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code and default config
COPY src/ ./src/
COPY docs/ ./docs/

# Create persistent storage directories with non-root ownership
RUN mkdir -p storage/temporary storage/quarantine \
    && chown -R node:node /app

# Switch to non-root user
USER node

# Expose internal service port
EXPOSE 4000

# Container healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Execute using dumb-init to properly handle PID 1 signals
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]

