## YAPI MCP Server - 架构设计方案

**1. 目标**

创建一个 MCP 服务器，充当 LLM 应用程序（如 Claude Desktop）与 YAPI 实例之间的桥梁。该服务器将允许 LLM 通过标准化的 MCP 工具安全地查询 YAPI 中的接口（API）信息，例如接口详情、分类下的接口列表等。

**2. 核心功能**

*   连接到指定的 YAPI 实例。
*   使用项目 Token 进行认证和授权。
*   提供 MCP 工具来获取 YAPI 数据：
    *   获取指定接口的详细信息。
    *   获取指定分类下的接口列表。
    *   获取项目的完整接口菜单（分类及接口）。
*   将从 YAPI 获取的数据格式化为适合 LLM 使用的文本格式（通常是 JSON 字符串）。

**3. 架构选择**

*   **语言/运行时**: TypeScript (Node.js)。这与许多官方参考实现（如 GitHub, GitLab, Filesystem）一致，并且有成熟的 MCP SDK (`@modelcontextprotocol/sdk`)。
*   **MCP 能力**: 主要利用 **Tools**。虽然接口信息是数据，但获取特定接口或列表通常需要参数（如 ID），使其更适合作为由模型驱动调用的工具，而不是静态或应用控制的资源。我们会为工具添加 `readOnlyHint` 注解。
*   **配置**:
    *   `YAPI_BASE_URL`: YAPI 实例的基础 URL (例如: `http://yapi.example.com`)。
    *   `YAPI_PROJECT_TOKEN`: 用于访问特定 YAPI 项目的 Token。
    *   这些将通过环境变量传递给服务器，以确保安全和灵活性。服务器实例将绑定到一个特定的 YAPI 项目 Token。
*   **Transport**:
    *   主要支持 **stdio**，这是本地与 Claude Desktop 等客户端集成的最简单方式。
    *   提供 **Dockerfile** 以支持容器化部署和更一致的环境。
*   **错误处理**: 捕获 YAPI API 调用错误（如网络问题、认证失败、无效 ID）和 MCP 内部错误（如参数验证失败），并以 MCP 标准错误格式返回给客户端。
*   **依赖**: `@modelcontextprotocol/sdk`, `zod` (用于输入验证), `node-fetch` (如果需要，取决于 Node 版本和全局 fetch 可用性)。

**4. MCP 工具定义**

我们将实现以下工具，映射到 YAPI 的开放接口：

*   **`yapi_get_interface_details`**
    *   **描述**: 获取指定 YAPI 接口的详细信息（包括请求/响应参数、类型、状态等）。
    *   **映射 YAPI Endpoint**: `GET /api/interface/get`
    *   **输入 Schema (Zod)**:
        ```typescript
        z.object({
          interface_id: z.number().describe("要获取详情的接口 ID")
        })
        ```
    *   **输出**: 包含接口详细信息的文本内容 (JSON 字符串格式)。
    *   **注解**: `readOnlyHint: true`

*   **`yapi_list_interfaces_by_category`**
    *   **描述**: 获取 YAPI 中指定分类下的所有接口列表（仅包含基本信息如名称、路径、方法）。
    *   **映射 YAPI Endpoint**: `GET /api/interface/list_cat`
    *   **输入 Schema (Zod)**:
        ```typescript
        z.object({
          category_id: z.number().describe("要获取列表的分类 ID"),
          page: z.number().optional().default(1).describe("页码 (可选, 默认为 1)"),
          limit: z.number().optional().default(10).describe("每页数量 (可选, 默认为 10)")
        })
        ```
    *   **输出**: 包含接口列表（及分页信息）的文本内容 (JSON 字符串格式)。
    *   **注解**: `readOnlyHint: true`

*   **`yapi_get_project_interface_menu`**
    *   **描述**: 获取 YAPI 项目的完整接口菜单，包含所有分类及其下的接口列表（仅含基本信息）。
    *   **映射 YAPI Endpoint**: `GET /api/interface/list_menu`
    *   **输入 Schema (Zod)**: `z.object({})` (无参数，项目由配置的 Token 决定)
    *   **输出**: 包含完整菜单结构（分类和接口）的文本内容 (JSON 字符串格式)。
    *   **注解**: `readOnlyHint: true`

*   **(可选) `yapi_get_project_info`**
    *   **描述**: 获取当前配置 Token 所对应 YAPI 项目的基本信息。
    *   **映射 YAPI Endpoint**: `GET /api/project/get`
    *   **输入 Schema (Zod)**: `z.object({})`
    *   **输出**: 包含项目信息的文本内容 (JSON 字符串格式)。
    *   **注解**: `readOnlyHint: true`

**5. 错误处理策略**

*   **YAPI API 错误**:
    *   捕获 `fetch` 过程中的网络错误、超时。
    *   检查 YAPI 返回的 HTTP 状态码，非 200 视为错误。
    *   检查 YAPI 返回 JSON 中的 `errcode` 字段，非 0 视为错误，并将 `errmsg` 返回。
    *   将这些错误包装成 MCP Tool 调用结果，设置 `isError: true`，并在 `content` 中提供清晰的错误信息。
*   **MCP 参数验证错误**:
    *   使用 Zod 在工具处理函数开始时验证输入参数。
    *   如果验证失败，抛出错误，MCP SDK 会自动将其转换为标准的 `InvalidParams` JSON-RPC 错误。
*   **配置错误**:
    *   在服务器启动时检查必要的环境变量 (`YAPI_BASE_URL`, `YAPI_PROJECT_TOKEN`) 是否存在，如果缺少则打印错误并退出。

**6. 安全考虑**

*   **Token 管理**: `YAPI_PROJECT_TOKEN` 通过环境变量传入，避免硬编码。确保运行环境的安全。
*   **只读操作**: 当前设计仅包含读取 YAPI 数据的工具，降低了意外修改 YAPI 项目的风险。明确标记为 `readOnlyHint: true`。
*   **输入清理**: 虽然 YAPI ID 通常是数字，但如果未来添加基于名称或路径的查询，需要进行适当的清理以防止潜在的注入（尽管 YAPI 本身应有防护）。
*   **信息暴露**: 返回的接口详情可能包含敏感信息（如内部路径、注释），客户端（如 Claude Desktop）的用户需要了解这一点。

**7. 设置与使用 (Claude Desktop)**

*   **环境变量**: 需要设置 `YAPI_BASE_URL` 和 `YAPI_PROJECT_TOKEN`。
*   **`claude_desktop_config.json` 配置**:
    *   **NPX 方式**:
        ```json
        {
          "mcpServers": {
            "yapi": {
              "command": "npx",
              "args": ["-y", "@your-npm-scope/mcp-server-yapi"], // 替换为实际发布的包名
              "env": {
                "YAPI_BASE_URL": "http://your-yapi-instance.com",
                "YAPI_PROJECT_TOKEN": "your_project_token_here"
              }
            }
          }
        }
        ```
    *   **Docker 方式**:
        ```json
        {
          "mcpServers": {
            "yapi": {
              "command": "docker",
              "args": ["run", "-i", "--rm",
                       "-e", "YAPI_BASE_URL=http://your-yapi-instance.com",
                       "-e", "YAPI_PROJECT_TOKEN=your_project_token_here",
                       "your-dockerhub-username/mcp-server-yapi:latest"], // 替换为实际镜像名
              "env": {
                // Docker 命令中已设置，这里通常为空，除非需要覆盖
              }
            }
          }
        }
        ```
*   **项目结构**:
    *   `src/`
        *   `index.ts` (主服务器逻辑)
        *   `yapiClient.ts` (封装 YAPI API 调用)
        *   `schemas.ts` (Zod 输入/输出模式)
    *   `package.json`
    *   `tsconfig.json`
    *   `README.md`
    *   `Dockerfile`

**8. 未来增强 (可选)**

*   支持通过参数指定 `project_id` 和 `token`，允许服务器与多个 YAPI 项目交互（需要仔细考虑安全性）。
*   添加创建/更新接口或分类的工具（需要写权限 Token）。
*   将接口定义作为 MCP 资源暴露，支持模板和订阅（更复杂）。
*   更复杂的搜索/过滤工具。

这个设计方案利用了 MCP 的核心概念（特别是 Tools），遵循了官方示例的模式，并考虑了配置、错误处理和安全。下一步是根据这个设计编写 TypeScript 代码。