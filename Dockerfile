# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js ./
COPY database.js ./
COPY public ./public
COPY ml ./ml

# Create directories for data and models
RUN mkdir -p /app/data /app/ml/models

# Expose port 3000 - accessible from all networks
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Create volumes for persistent storage
# - /app/data: Database storage
# - /app/ml/models: ML model versions and training logs
VOLUME ["/app/data", "/app/ml/models"]

# Start the application (binds to 0.0.0.0 for remote access)
CMD ["node", "server.js"]
