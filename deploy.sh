#!/bin/bash

# Xnake Docker Build and Deploy Script
# This script stops, removes, rebuilds and deploys the Xnake game container

set -e  # Exit on any error

echo "=========================================="
echo "  Xnake Docker Build & Deploy Script"
echo "=========================================="
echo ""

# Configuration
CONTAINER_NAME="Xnake"
IMAGE_NAME="xnake-game"
PORT="3000"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker first."
    exit 1
fi

echo "✓ Docker is running"
echo ""

# Check if container exists and is running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "🔍 Found existing container: ${CONTAINER_NAME}"
    
    # Stop the container if it's running
    if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
        echo "🛑 Stopping container: ${CONTAINER_NAME}"
        docker stop ${CONTAINER_NAME}
    fi
    
    # Remove the container
    echo "🗑️  Removing container: ${CONTAINER_NAME}"
    docker rm ${CONTAINER_NAME}
    echo "✓ Container removed"
    echo ""
else
    echo "ℹ️  No existing container found"
    echo ""
fi

# Check if old image exists and remove it
if docker images --format '{{.Repository}}' | grep -q "^${IMAGE_NAME}$"; then
    echo "🗑️  Removing old image: ${IMAGE_NAME}"
    docker rmi ${IMAGE_NAME}
    echo "✓ Old image removed"
    echo ""
else
    echo "ℹ️  No existing image found"
    echo ""
fi

# Build the Docker image
echo "🔨 Building Docker image: ${IMAGE_NAME}"
docker build -t ${IMAGE_NAME} .

if [ $? -eq 0 ]; then
    echo "✓ Docker image built successfully"
    echo ""
else
    echo "❌ Failed to build Docker image"
    exit 1
fi

# Run the container
echo "🚀 Starting container: ${CONTAINER_NAME}"
docker run -d \
    --name ${CONTAINER_NAME} \
    -p ${PORT}:${PORT} \
    --restart unless-stopped \
    -v "$(pwd)":/app \
    ${IMAGE_NAME}

if [ $? -eq 0 ]; then
    echo "✓ Container started successfully"
    echo ""
else
    echo "❌ Failed to start container"
    exit 1
fi

# Wait a moment for the container to start
sleep 2

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "=========================================="
    echo "  ✅ Deployment Successful!"
    echo "=========================================="
    echo ""
    echo "🐍 Xnake Game Server is running!"
    echo ""
    echo "📍 Access URLs:"
    echo "   Local:    http://localhost:${PORT}"
    echo "   Network:  http://$(hostname -I | awk '{print $1}'):${PORT}"
    echo ""
    echo "🎮 Open your browser and start playing!"
    echo ""
    echo "📊 Useful Commands:"
    echo "   View logs:    docker logs ${CONTAINER_NAME}"
    echo "   Stop:         docker stop ${CONTAINER_NAME}"
    echo "   Restart:      docker restart ${CONTAINER_NAME}"
    echo "   Remove:       docker rm -f ${CONTAINER_NAME}"
    echo ""
    echo "🎯 Database file: xnake.db (persisted in current directory)"
    echo ""
else
    echo "❌ Container failed to start properly"
    echo "📋 Check logs with: docker logs ${CONTAINER_NAME}"
    exit 1
fi
