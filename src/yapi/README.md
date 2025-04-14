# YAPI MCP Server

A Model Context Protocol (MCP) server for interacting with YAPI instances. This server allows LLM applications like Claude Desktop to retrieve API documentation details stored in a YAPI project.

## Features

- Connects to a specific YAPI instance and project using configuration.
- Provides tools to query YAPI for:
    - Detailed information about a specific API interface.
    - A list of interfaces within a specific category (with pagination).
    - The entire API menu structure (categories and interfaces) for the project.
    - Basic information about the project itself.
- Securely handles YAPI project tokens via environment variables.
- Returns data in a structured JSON format suitable for LLM processing.

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

This server requires the following environment variables to be set:

-   `YAPI_BASE_URL`: The base URL of your YAPI instance (e.g., `http://yapi.yourcompany.com`). Do **not** include `/api` or a trailing slash.
-   `YAPI_PROJECT_TOKEN`: The token for the specific YAPI project you want to access. Find this in your YAPI project settings under "Tokens".

## Usage with Claude Desktop

Add the following configuration to your `claude_desktop_config.json` file. Create the file if it doesn't exist (see locations in the official MCP Quickstart).

*Replace placeholders with your actual YAPI URL and token.*

### Using NPX (Recommended for published package)

```json
{
  "mcpServers": {
    "yapi": {
      "command": "npx",
      "args": [
        "-y",
        "@your-npm-scope/mcp-server-yapi" // Replace with the actual published package name
      ],
      "env": {
        "YAPI_BASE_URL": "YOUR_YAPI_INSTANCE_URL",
        "YAPI_PROJECT_TOKEN": "YOUR_YAPI_PROJECT_TOKEN"
      }
    }
  }
}