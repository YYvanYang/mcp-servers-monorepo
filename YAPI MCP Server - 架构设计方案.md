## YAPI MCP Server - 架构设计方案

**1. 目标**

创建一个 MCP 服务器，充当 LLM 应用程序（如 Claude Desktop）与 YAPI 实例之间的桥梁。该服务器将允许 LLM 通过标准化的 MCP 工具安全地查询 YAPI 中的接口（API）信息，并支持多种连接方式以适应不同部署场景。

**2. 核心功能**

*   连接到指定的 YAPI 实例。
*   使用项目 Token 进行认证和授权。
*   提供 MCP 工具来获取 YAPI 数据：
    *   获取指定接口的详细信息。
    *   获取指定分类下的接口列表（支持分页）。
    *   获取项目的完整接口菜单（分类及接口）。
    *   获取项目的基本信息。
*   将从 YAPI 获取的数据格式化为适合 LLM 使用的文本格式 (JSON 字符串)。
*   支持通过 **stdio** 和 **SSE** 两种传输方式与 MCP 客户端通信。

**3. 架构选择**

*   **语言/运行时**: TypeScript (Node.js v18+)。利用其异步特性和强类型系统。
*   **项目结构**: Monorepo 包 (`@mcp-servers/yapi`)，采用模块化设计：
    *   `index.ts`: 主入口，处理命令行参数，选择并启动传输层。
    *   `mcp_server.ts`: 负责 MCP Server 的实例化和请求处理逻辑的注册。
    *   `yapiService.ts`: 封装所有与 YAPI API 的交互逻辑，提供清晰的服务层。
    *   `schemas.ts`: 使用 Zod 定义所有输入参数和预期的 YAPI 响应数据结构。
    *   `errors.ts`: 定义自定义错误类型（如 `YapiError`, `ConfigurationError`）。
    *   `transports/`: 包含特定传输方式的启动逻辑 (`stdio.ts`, `sse.ts`)。
*   **MCP 能力**: 主要利用 **Tools**，并为工具添加 `readOnlyHint: true` 注解。
*   **配置**:
    *   **环境变量 (必须)**:
        *   `YAPI_BASE_URL`: YAPI 实例的基础 URL (例如: `http://yapi.example.com`)。
        *   `YAPI_PROJECT_TOKEN`: 用于访问特定 YAPI 项目的 Token。
    *   **环境变量 (可选, 仅 SSE)**:
        *   `PORT`: SSE 服务器监听的端口 (默认 3000)。
    *   **命令行参数 (可选)**:
        *   `--transport <stdio|sse>` 或 `-t <stdio|sse>`: 指定传输模式 (默认基于 `PORT` 环境变量自动选择，无 `PORT` 则为 `stdio`)。
        *   `--port <number>` 或 `-p <number>`: 覆盖 SSE 模式的端口 (优先于 `PORT` 环境变量)。
        *   `--help` 或 `-h`: 显示帮助信息。
*   **Transport**:
    *   **stdio**: 通过 `StdioServerTransport` 实现，用于本地单客户端连接 (如 Claude Desktop 直接启动)。
    *   **SSE**: 通过 `SSEServerTransport` 和 `express` (v5.x 对齐，实际使用 v4.x 或 v5.x 均可) 实现，监听指定端口，支持多个并发客户端连接。需要 `cors` 中间件。
*   **错误处理**:
    *   在 `yapiService.ts` 中捕获和处理 YAPI API 调用错误（网络、HTTP 状态、业务 `errcode`），包装为 `YapiError`。
    *   在 `mcp_server.ts` 中捕获 `YapiError` 和 `ZodError` (参数验证)，将其转换为 MCP Tool 的 `isError: true` 响应，并提供有意义的错误消息。
    *   在 `index.ts` 和 `yapiService.ts` 的构造函数中检查配置错误 (`ConfigurationError`)。
    *   为 SSE 实现添加基础的 Express 错误处理中间件。
*   **依赖**: `@modelcontextprotocol/sdk`, `zod`, `zod-to-json-schema`, `express`, `cors`, `@types/*`。

**4. MCP 工具定义 (与之前一致，但输入由 Zod 验证)**

*   **`yapi_get_interface_details`** (映射 `GET /api/interface/get`)
    *   输入: `{ interface_id: number }`
    *   输出: JSON 字符串 (接口详情)
    *   注解: `readOnlyHint: true`, `title: "Get YAPI Interface Details"`
*   **`yapi_list_interfaces_by_category`** (映射 `GET /api/interface/list_cat`)
    *   输入: `{ category_id: number, page?: number, limit?: number }`
    *   输出: JSON 字符串 (接口列表及分页信息)
    *   注解: `readOnlyHint: true`, `title: "List YAPI Interfaces by Category"`
*   **`yapi_get_project_interface_menu`** (映射 `GET /api/interface/list_menu`)
    *   输入: `{}`
    *   输出: JSON 字符串 (项目菜单结构)
    *   注解: `readOnlyHint: true`, `title: "Get YAPI Project Menu"`
*   **`yapi_get_project_info`** (映射 `GET /api/project/get`)
    *   输入: `{}`
    *   输出: JSON 字符串 (项目基本信息)
    *   注解: `readOnlyHint: true`, `title: "Get YAPI Project Info"`

**5. 安全考虑**

*   **Token 管理**: `YAPI_PROJECT_TOKEN` 通过环境变量传入，避免硬编码。
*   **只读操作**: 仅实现读取操作，降低风险。
*   **输入验证**: 使用 Zod 严格验证所有工具输入。
*   **信息暴露**: 返回的 YAPI 数据可能包含内部细节，客户端需注意。
*   **SSE 安全**:
    *   使用 `cors` 中间件控制跨域访问 (生产环境应配置具体允许的源)。
    *   (可选增强) 在 `/sse` 端点验证 `Origin` 头。
    *   (可选增强) 如果部署在可信网络之外，考虑为 SSE 端点添加认证/授权层。

**6. 设置与使用 (与之前一致，但更新了启动命令和配置示例)**

*   **环境变量**: 必须设置 `YAPI_BASE_URL`, `YAPI_PROJECT_TOKEN`。SSE 模式可选 `PORT`。
*   **运行**: 使用 `node dist/index.js [--transport <stdio|sse>] [--port <number>]`。
*   **`claude_desktop_config.json`**:
    *   **Stdio**: 配置 `command` 和 `args` (包含 `--transport stdio`)，并在 `env` 中设置 YAPI 变量。
    *   **SSE**: 独立运行服务器进程 (例如 `node dist/index.js --transport sse`)，然后在配置中使用 `"transport": {"type": "http", "url": "http://localhost:PORT/sse"}`，`env` 通常为空。
*   **Docker**: Dockerfile 用于构建镜像。运行时通过 `-e` 传递环境变量，并通过命令行参数指定 transport。

**7. 未来增强 (可选)**

*   添加写操作工具 (需要更严格的 Token 管理和权限控制)。
*   将 YAPI 接口/分类作为 MCP 资源暴露。
*   更高级的错误分类和重试逻辑。
*   为 SSE 添加更强的认证/授权。
