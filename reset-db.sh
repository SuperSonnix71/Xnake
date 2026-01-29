#!/bin/bash

# Xnake Database Reset Script
# This script removes the database file to reset all players and scores

set -e  # Exit on any error

echo "=========================================="
echo "  Xnake Database Reset Script"
echo "=========================================="
echo ""

# Configuration
DB_FILE="xnake.db"
CONTAINER_NAME="Xnake"

# Warning message
echo "⚠️  WARNING: This will delete ALL player data and scores!"
echo ""
echo "Database file: ${DB_FILE}"
echo ""

# Ask for confirmation
read -p "Are you sure you want to reset the database? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo ""
    echo "❌ Database reset cancelled"
    exit 0
fi

echo ""

# Check if container is running
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "🛑 Stopping container: ${CONTAINER_NAME}"
    docker stop ${CONTAINER_NAME}
    echo "✓ Container stopped"
    echo ""
fi

# Remove database file if it exists
if [ -f "${DB_FILE}" ]; then
    echo "🗑️  Removing database file: ${DB_FILE}"
    rm -f "${DB_FILE}"
    echo "✓ Database file removed"
    echo ""
else
    echo "ℹ️  Database file not found (already clean)"
    echo ""
fi

# Restart container if it was running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "🚀 Restarting container: ${CONTAINER_NAME}"
    docker start ${CONTAINER_NAME}
    echo "✓ Container restarted"
    echo ""
fi

echo "=========================================="
echo "  ✅ Database Reset Complete!"
echo "=========================================="
echo ""
echo "🎮 The game will start fresh with:"
echo "   - No registered players"
echo "   - No scores"
echo "   - Empty Hall of Fame"
echo ""
echo "💡 First player to visit will need to register again"
echo ""
