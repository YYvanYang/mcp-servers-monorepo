#!/bin/bash

# Set script to exit on error
set -e

# Show commands being executed
set -x

# Get script directory absolute path
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# Project root directory (assuming script is in the root)
PROJECT_ROOT="$SCRIPT_DIR"

# Ensure execution in project root
cd "$PROJECT_ROOT"

# Clean previous failed builds (optional but good practice)
echo "Cleaning previous failed builds..."
docker system prune -f

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  # Run npm ci in project root for workspace setup
  npm ci
fi

# Define YAPI package paths
YAPI_SRC_DIR="$PROJECT_ROOT/src/yapi"
YAPI_DIST_DIR="$YAPI_SRC_DIR/dist"

# Build YAPI server if dist doesn't exist or TS files are newer
if [ ! -d "$YAPI_DIST_DIR" ] || [ -n "$(find "$YAPI_SRC_DIR" -name "*.ts" -newer "$YAPI_DIST_DIR" -print -quit)" ]; then
  echo "Building YAPI server..."
  npm run build -w @mcp-servers/yapi
fi

# Define image name and tag
IMAGE_NAME="yvan919/mcp-server-yapi" # Or your preferred image name
IMAGE_TAG="latest" # Or use a version number, e.g., 0.3.0

# Define target platforms
PLATFORMS="linux/amd64,linux/arm64"

# Build and push multi-platform Docker image
echo "Building and pushing multi-platform Docker image for $PLATFORMS..."
docker buildx build \
  --platform "$PLATFORMS" \
  -t "$IMAGE_NAME:$IMAGE_TAG" \
  -f "$YAPI_SRC_DIR/Dockerfile" \
  --push \
  . # Build context is the project root

echo "Build and push completed!"
echo "You can now run the container in the background on supported platforms using:"
# Updated docker run command example for Streamable HTTP
echo "docker run -d --name yapi-mcp-server -p 3000:3000 -e YAPI_BASE_URL='your-yapi-url' -e YAPI_PROJECT_TOKEN='your-project-token' $IMAGE_NAME:$IMAGE_TAG"
echo ""
echo "The server will run using Streamable HTTP on port 3000 by default."
echo "To run using stdio transport instead:"
echo "docker run -i --rm -e YAPI_BASE_URL='your-yapi-url' -e YAPI_PROJECT_TOKEN='your-project-token' $IMAGE_NAME:$IMAGE_TAG --transport stdio"
echo ""
echo "To view logs (for detached container): docker logs yapi-mcp-server"
echo "To stop the container: docker stop yapi-mcp-server"
echo "To remove the container: docker rm yapi-mcp-server"