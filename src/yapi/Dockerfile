# Stage 1: Builder - Installs all dependencies and builds the specific package
FROM node:lts-alpine AS builder

WORKDIR /app

# Copy root configuration files (needed for workspace setup)
COPY package.json package-lock.json ./
COPY tsconfig.json ./

# Copy the source code for the YAPI server package
# 确保 YAPI 源代码和它的 package.json 都被复制
COPY src/yapi ./src/yapi

# Install ALL workspace dependencies using npm ci (including dev dependencies)
# 确保在此阶段运行脚本，以便执行构建
# 使用 --ignore-scripts=false 或省略它，以确保 prepare/build 运行
RUN --mount=type=cache,target=/root/.npm npm ci

# Build only the target YAPI server workspace package
RUN npm run build -w @mcp-servers/yapi

# Prune development dependencies AFTER the build step
# 这会移除 devDependencies，留下生产所需的 node_modules
RUN npm prune --production


# Stage 2: Production Release - Copies only necessary artifacts
FROM node:lts-alpine AS release

WORKDIR /app

# Set NODE_ENV to production
ENV NODE_ENV=production

# 复制必要的 package.json (某些运行时依赖可能需要它)
COPY --from=builder /app/package.json ./package.json
# 复制 yapi 包的 package.json (可能需要)
COPY --from=builder /app/src/yapi/package.json ./src/yapi/package.json

# 从 builder 阶段复制经过 prune 的、只包含生产依赖的 node_modules
COPY --from=builder /app/node_modules ./node_modules
# 如果工作区内部也有 node_modules (现代 npm 不太常见)，也复制它
# COPY --from=builder /app/src/yapi/node_modules ./src/yapi/node_modules

# 从 builder 阶段复制已构建的 YAPI 服务器代码
COPY --from=builder /app/src/yapi/dist ./src/yapi/dist

# 暴露默认的 SSE 端口
EXPOSE 3000

# 运行时所需的环境变量
ENV YAPI_BASE_URL=""
ENV YAPI_PROJECT_TOKEN=""
# SSE 的默认端口
ENV PORT="3000"

# 定义运行服务器脚本的入口点
ENTRYPOINT ["node", "src/yapi/dist/index.js"]

# 可选：如果 `docker run` 未提供，则使用默认命令
CMD ["--transport", "stdio"]