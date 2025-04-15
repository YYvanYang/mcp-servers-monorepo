#!/bin/bash

# 设置错误时脚本停止执行
set -e

# 显示执行的命令
set -x

# 确保在根目录执行
cd "$(dirname "$0")"

# 清理之前失败的构建
echo "Cleaning previous failed builds..."
docker system prune -f

# 检查node_modules是否存在，不存在则安装依赖
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm ci
fi

# 检查是否有未构建的更改
if [ ! -d "src/yapi/dist" ] || [ -n "$(find src/yapi -name "*.ts" -newer src/yapi/dist -print -quit)" ]; then
  echo "Building YAPI server..."
  npm run build -w @mcp-servers/yapi
fi

# 构建Docker镜像
echo "Building Docker image..."
docker build -t yvan919/mcp-server-yapi:latest -f src/yapi/Dockerfile .

echo "Build completed!"
echo "You can run the container with the following command:"
echo "docker run -p 3000:3000 -e YAPI_BASE_URL='your-yapi-url' -e YAPI_PROJECT_TOKEN='your-project-token' yvan919/mcp-server-yapi:latest --transport sse" 