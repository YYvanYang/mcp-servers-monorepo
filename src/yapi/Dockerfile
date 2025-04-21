# Stage 1: Builder - Installs all dependencies and builds the specific package
FROM node:lts-alpine AS builder

WORKDIR /app

# Copy root configuration files (needed for workspace setup)
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy the source code for the YAPI server package
# Ensure YAPI source code and its package.json are copied
COPY src/yapi ./src/yapi

# Install ALL workspace dependencies using npm ci (including dev dependencies)
# Use --ignore-scripts=false or omit it to ensure prepare/build run
RUN --mount=type=cache,target=/root/.npm npm ci --include=dev

# Build only the target YAPI server workspace package
RUN npm run build -w @mcp-servers/yapi

# Prune development dependencies AFTER the build step
# This removes devDependencies, leaving only production dependencies
RUN npm prune --production


# Stage 2: Production Release - Copies only necessary artifacts
FROM node:lts-alpine AS release

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# Copy necessary package.json files (runtime dependencies might need them)
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/yapi/package.json ./src/yapi/package.json

# Copy pruned node_modules (production dependencies only)
COPY --from=builder /app/node_modules ./node_modules
# If workspaces create internal node_modules (less common with modern npm), copy them too
# COPY --from=builder /app/src/yapi/node_modules ./src/yapi/node_modules

# Copy built YAPI server code
COPY --from=builder /app/src/yapi/dist ./src/yapi/dist

# Expose the default Streamable HTTP port
EXPOSE 3000

# Runtime environment variables
ENV YAPI_BASE_URL=""
ENV YAPI_PROJECT_TOKEN=""
# Default port for Streamable HTTP
ENV PORT="3000"

# Define the entry point to run the server script
ENTRYPOINT ["node", "src/yapi/dist/index.js"]

# Default command if none provided in `docker run`.
# Starts the server in Streamable HTTP mode by default.
CMD ["--transport", "streamable-http"]