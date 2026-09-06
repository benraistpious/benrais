# Use official Node.js 22 LTS Alpine image
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy package definition
COPY package*.json ./

# Install dependencies if present
RUN npm install --omit=dev 2>/dev/null || true

# Copy all project files
COPY . .

# Create persistent storage directories
RUN mkdir -p data uploads

# Expose default port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["node", "local-server.js"]
