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

# Create directory for database
RUN mkdir -p /app/data

# Expose port 3000 - accessible from all networks
EXPOSE 3000

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production

# Create volume for persistent database storage
VOLUME ["/app"]

# Start the application (binds to 0.0.0.0 for remote access)
CMD ["node", "server.js"]
