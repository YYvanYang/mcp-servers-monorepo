#!/bin/bash

# 设置错误时脚本停止执行
set -e

# 显示执行的命令
set -x

# 获取脚本所在目录的绝对路径
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# 项目根目录（假设脚本在项目根目录下）
PROJECT_ROOT="$SCRIPT_DIR"

# 确保在项目根目录执行
cd "$PROJECT_ROOT"

# 清理之前失败的构建 (保持不变)
echo "Cleaning previous failed builds..."
docker system prune -f

# 检查 node_modules 是否存在，不存在则安装依赖 (保持不变)
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  # 最好在项目根目录运行 npm ci
  npm ci
fi

# 定义 YAPI 包的路径
YAPI_SRC_DIR="$PROJECT_ROOT/src/yapi"
YAPI_DIST_DIR="$YAPI_SRC_DIR/dist"

# 检查是否有未构建的更改 (保持不变)
if [ ! -d "$YAPI_DIST_DIR" ] || [ -n "$(find "$YAPI_SRC_DIR" -name "*.ts" -newer "$YAPI_DIST_DIR" -print -quit)" ]; then
  echo "Building YAPI server..."
  npm run build -w @mcp-servers/yapi
fi

# 定义镜像名称和标签
IMAGE_NAME="yvan919/mcp-server-yapi"
IMAGE_TAG="latest" # 或者使用版本号

# 定义目标平台
PLATFORMS="linux/amd64,linux/arm64"

# 构建并推送多平台 Docker 镜像
echo "Building and pushing multi-platform Docker image for $PLATFORMS..."
docker buildx build \
  --platform "$PLATFORMS" \
  -t "$IMAGE_NAME:$IMAGE_TAG" \
  -f "$YAPI_SRC_DIR/Dockerfile" \
  --push \
  . # 构建上下文是项目根目录

echo "Build and push completed!"
echo "You can now run the container in the background on supported platforms using:"
# 在 docker run 命令中添加 -d 标志
echo "docker run -d --name yapi-mcp-server-sse -p 3000:3000 -e YAPI_BASE_URL='your-yapi-url' -e YAPI_PROJECT_TOKEN='your-project-token' $IMAGE_NAME:$IMAGE_TAG --transport sse"
echo ""
echo "To view logs: docker logs yapi-mcp-server-sse"
echo "To stop the container: docker stop yapi-mcp-server-sse"
echo "To remove the container: docker rm yapi-mcp-server-sse"