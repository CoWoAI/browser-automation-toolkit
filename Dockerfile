# Browser Automation Toolkit - Docker Image
# This runs the command server that bridges external tools with Chrome extension

FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (none for this project, but future-proofs)
RUN npm ci --production --ignore-scripts 2>/dev/null || true

# Copy server code
COPY server.js ./

# Expose the default port
EXPOSE 8766

# Environment variables
ENV PORT=8766
ENV COMMAND_TIMEOUT=30000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8766/ || exit 1

# Run the server
CMD ["node", "server.js"]
