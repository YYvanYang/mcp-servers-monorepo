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

# Stage 2: Production Release - Copies only necessary artifacts
FROM node:18-alpine AS release

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy essential root files
COPY package.json package-lock.json ./

# Copy only the production node_modules from the builder stage
# This avoids copying devDependencies
COPY --from=builder /app/node_modules ./node_modules

# Copy the built YAPI server code from the builder stage
COPY --from=builder /app/src/yapi/dist ./src/yapi/dist
# Copy the YAPI server's package.json (might be needed for runtime info)
COPY --from=builder /app/src/yapi/package.json ./src/yapi/package.json

# Expose environment variables (optional, documentation purpose)
# These must be set when running the container (`docker run -e ...`)
ENV YAPI_BASE_URL=""
ENV YAPI_PROJECT_TOKEN=""

# Define the entry point using the path within the container
ENTRYPOINT ["node", "src/yapi/dist/index.js"]