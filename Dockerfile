# Use official Node.js runtime as base image
FROM node:18-alpine

# Set working directory in container
WORKDIR /app

# Install curl for healthchecks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Install nodemon for development (only if package-lock.json includes it)
RUN npm install --save-dev nodemon

# Copy application code
COPY server.js ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodeuser -u 1001

# Create uploads directory and set permissions
RUN mkdir -p uploads && \
    chown -R nodeuser:nodejs /app && \
    chmod 755 uploads

# Switch to non-root user
USER nodeuser

# Expose port
EXPOSE 3000

# Set default HEALTHCHECK_URL (can be overridden by docker-compose)
ENV HEALTHCHECK_URL=http://localhost:3000/health

# Health check
HEALTHCHECK --interval=15m --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f $HEALTHCHECK_URL || exit 1

# Start the application
CMD ["npm", "start"]