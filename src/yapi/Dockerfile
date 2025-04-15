# Stage 1: Builder - Installs all dependencies and builds the specific package
FROM node:18-alpine AS builder

WORKDIR /app

# Copy root configuration files (needed for workspace setup)
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy the source code for the YAPI server package
COPY src/yapi ./src/yapi

# Install ALL workspace dependencies using npm ci
# Use --mount for better Docker layer caching for npm modules
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# Build only the target YAPI server workspace package
# Use the package name defined in src/yapi/package.json
RUN npm run build -w @mcp-servers/yapi

# Prune development dependencies from the root node_modules
# Also prune nested node_modules within src/yapi if they exist (less likely with workspaces)
# Use --omit=dev in the final stage's npm ci instead for cleaner approach
# RUN npm prune --production


# Stage 2: Production Release - Copies only necessary artifacts
FROM node:18-alpine AS release

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy essential root files needed for install
COPY package.json package-lock.json ./
COPY src/yapi/package.json ./src/yapi/package.json

# Install *only* production dependencies using the lock file
# This ensures we only get what's needed for runtime based on the lock file state
# We copy the yapi package.json above so npm knows about its production deps
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --include-workspace-root

# Copy the built YAPI server code from the builder stage
COPY --from=builder /app/src/yapi/dist ./src/yapi/dist

# Expose the default SSE port
EXPOSE 3000

# Environment variables expected at runtime
ENV YAPI_BASE_URL=""
ENV YAPI_PROJECT_TOKEN=""
# Default port for SSE
ENV PORT="3000" 

# Define the entry point to run the server script
# Command-line arguments (like --transport) should be passed via `docker run`
ENTRYPOINT ["node", "src/yapi/dist/index.js"]

# Optional: Default command if none provided via `docker run`
# CMD ["--transport", "stdio"]