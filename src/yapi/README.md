# YAPI MCP Server

A Model Context Protocol (MCP) server for interacting with YAPI instances. This server allows LLM applications like Claude Desktop to retrieve API documentation details stored in a YAPI project. It supports both STDIO and SSE transports.

## Features

- Connects to a specific YAPI instance and project using configuration.
- Provides tools to query YAPI for:
    - Detailed information about a specific API interface.
    - A list of interfaces within a specific category (with pagination).
    - The entire API menu structure (categories and interfaces) for the project.
    - Basic information about the project itself.
- Securely handles YAPI project tokens via environment variables.
- Returns data in a structured JSON format suitable for LLM processing.
- Supports both STDIO (for local, single-client use) and SSE (for potentially remote, multi-client use) transports via command-line arguments.

## Tools Provided

1.  **`yapi_get_interface_details`**
    *   **Description**: 获取指定 YAPI 接口的详细信息（包括请求/响应参数、类型、状态等）。
    *   **Input**: `interface_id` (number): The ID of the YAPI interface.
    *   **Output**: JSON string containing the detailed interface specification.

2.  **`yapi_list_interfaces_by_category`**
    *   **Description**: 获取 YAPI 中指定分类下的所有接口列表（仅包含基本信息如名称、路径、方法）。支持分页。
    *   **Input**:
        *   `category_id` (number): The ID of the YAPI category.
        *   `page` (number, optional, default: 1): Page number for pagination.
        *   `limit` (number, optional, default: 10): Number of items per page.
    *   **Output**: JSON string containing the list of interfaces and pagination info (`count`, `total`, `list`).

3.  **`yapi_get_project_interface_menu`**
    *   **Description**: 获取当前 YAPI 项目的完整接口菜单，包含所有分类及其下的接口列表（仅含基本信息）。
    *   **Input**: None.
    *   **Output**: JSON string representing the project's menu structure.

4.  **`yapi_get_project_info`**
    *   **Description**: 获取当前配置 Token 所对应 YAPI 项目的基本信息。
    *   **Input**: None.
    *   **Output**: JSON string containing basic project details.

## Setup

### Prerequisites

-   Node.js v18.0.0 or later.
-   Access to a YAPI instance and a project token with read permissions.

### Environment Variables

This server requires the following environment variables to be set when running:

-   **`YAPI_BASE_URL`**: The **base URL** of your YAPI instance (e.g., `http://yapi.yourcompany.com` or `https://yapi.internal.net`). **Important:** Do *not* include `/api`, `/project/`, or any path beyond the domain/base path.
-   **`YAPI_PROJECT_TOKEN`**: The token for the specific YAPI project you want to access. Find this in your YAPI project settings under "Tokens".
-   `PORT` (Optional, for SSE mode): The port number for the SSE server to listen on. Defaults to 3000. Can also be set via `--port` argument.

### Command-Line Arguments

-   `--transport <mode>` or `-t <mode>`: Specifies the transport mode. Use `stdio` (default) or `sse`.
-   `--port <number>` or `-p <number>`: Specifies the port for the SSE server (default: 3000 or `PORT` env var). Ignored if transport is `stdio`.
-   `--help` or `-h`: Displays usage instructions.

## Usage

### Running the Server

**1. Build the server:**

```bash
cd /path/to/mcp-servers-monorepo
npm install # Install dependencies for all workspaces
npm run build -w @mcp-servers/yapi # Build only the yapi package
```

**2. Set Environment Variables:**

```bash
# Example:
export YAPI_BASE_URL="https://yapi.example.com" # Correct Base URL
export YAPI_PROJECT_TOKEN="YOUR_YAPI_PROJECT_TOKEN"
# export PORT=4000 # Optional for SSE
```

**3. Run:**

*   **STDIO Mode (Default):**
    ```bash
    node src/yapi/dist/index.js
    # or explicitly
    node src/yapi/dist/index.js --transport stdio
    ```

*   **SSE Mode:**
    ```bash
    node src/yapi/dist/index.js --transport sse
    # or specify a port
    node src/yapi/dist/index.js --transport sse --port 4000
    ```

### Usage with Claude Desktop

Add the following configuration to your `claude_desktop_config.json` file.

*Replace placeholders with your actual paths, **correct** YAPI Base URL, and token.*

**STDIO Mode (Recommended for local single use):**

```json
{
  "mcpServers": {
    "yapi-stdio": {
      "command": "node",
      "args": [
        "/absolute/path/to/mcp-servers-monorepo/src/yapi/dist/index.js",
        "--transport", "stdio" // Explicitly set stdio
      ],
      "env": {
        "YAPI_BASE_URL": "https://yapi.example.com", // **** Correct base URL ****
        "YAPI_PROJECT_TOKEN": "YOUR_YAPI_PROJECT_TOKEN"
        // Add any other necessary environment variables here, e.g., NODE_PATH
      }
    }
  }
}
```

**SSE Mode (Requires the server to be running separately):**

First, start the server in SSE mode from your terminal (see "Running the Server" above, ensuring correct environment variables are set).

Then, configure Claude Desktop to connect via HTTP:

```json
{
  "mcpServers": {
    "yapi-sse": {
      "transport": {
          "type": "http",
          "url": "http://localhost:3000/sse" // Adjust port if needed
      }
      // 'env' is usually not needed here as env vars are set when running the server externally
    }
  }
}
```

**Important:** For SSE, ensure the server process is running *before* starting Claude Desktop or managed by a process manager (like `pm2`).

### Using Docker

Build the image first: `docker build -t your-dockerhub-username/mcp-server-yapi:latest src/yapi`

**STDIO Mode with Docker:**

```json
{
  "mcpServers": {
    "yapi-docker-stdio": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "YAPI_BASE_URL=https://yapi.example.com", // **** Correct base URL ****
        "-e", "YAPI_PROJECT_TOKEN=YOUR_YAPI_PROJECT_TOKEN",
        "your-dockerhub-username/mcp-server-yapi:latest", // Use your image name
        "--transport", "stdio" // Explicitly run in stdio mode inside container
      ]
    }
  }
}
```

**SSE Mode with Docker (Run Separately):**

Start the container:
```bash
# Replace port 3000 if you used a different one
docker run -d --rm --name yapi-mcp-sse \
  -p 3000:3000 \
  -e YAPI_BASE_URL="https://yapi.example.com" \
  -e YAPI_PROJECT_TOKEN="YOUR_YAPI_PROJECT_TOKEN" \
  -e PORT="3000" \
  your-dockerhub-username/mcp-server-yapi:latest \
  --transport sse # Run in SSE mode
```

Then configure Claude Desktop as shown in the SSE Mode example above, using `http://localhost:3000/sse`.

## Building

### Local Build

1.  Navigate to the monorepo root: `cd /path/to/mcp-servers-monorepo`
2.  Install all dependencies: `npm install`
3.  Build the YAPI package: `npm run build -w @mcp-servers/yapi`

### Docker Build

1.  Navigate to the YAPI package directory: `cd /path/to/mcp-servers-monorepo/src/yapi`
2.  Build the Docker image: `docker build -t your-dockerhub-username/mcp-server-yapi:latest .`
    *   Replace `your-dockerhub-username/mcp-server-yapi` with your desired image name.

## Debugging

Use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector) to test the server locally.

**For STDIO:**

```bash
# Ensure environment variables are set with the CORRECT base URL
export YAPI_BASE_URL="https://yapi.example.com"
export YAPI_PROJECT_TOKEN="..."

# Run inspector pointing to the built script
npx @modelcontextprotocol/inspector node /path/to/mcp-servers-monorepo/src/yapi/dist/index.js --transport stdio
```

**For SSE:**

1.  Start the server in SSE mode (see "Running the Server").
2.  Run the inspector connecting to the HTTP endpoint:
    ```bash
    npx @modelcontextprotocol/inspector http://localhost:3000/sse # Adjust port if needed
    ```

Check Claude Desktop logs for errors: `~/Library/Logs/Claude/mcp-server-yapi-....log` (macOS) or `%APPDATA%\Claude\logs\mcp-server-yapi-....log` (Windows). Server logs (stderr) will also appear in your terminal when running locally or via `docker logs yapi-mcp-sse`.

## License

MIT License - see the main [LICENSE](../../LICENSE) file in the repository root.