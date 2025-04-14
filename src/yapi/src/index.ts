#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError, z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
    GetInterfaceDetailsArgsSchema,
    ListInterfacesByCategoryArgsSchema,
    GetProjectInterfaceMenuArgsSchema,
    GetProjectInfoArgsSchema,
    GetInterfaceDetailsArgs,
    ListInterfacesByCategoryArgs,
} from "./schemas.js";
import { YapiClient, YapiError } from "./yapiClient.js";

// --- 辅助类型定义 ---
type McpToolInputSchema = {
    type: "object";
    properties?: { [key: string]: unknown };
    required?: string[];
    [key: string]: unknown; // 允许其他 JSON Schema 属性
};

// --- 配置检查 ---
const YAPI_BASE_URL = process.env.YAPI_BASE_URL;
const YAPI_PROJECT_TOKEN = process.env.YAPI_PROJECT_TOKEN;

if (!YAPI_BASE_URL) {
  console.error("Error: YAPI_BASE_URL environment variable is not set.");
  process.exit(1);
}
if (!YAPI_PROJECT_TOKEN) {
  console.error("Error: YAPI_PROJECT_TOKEN environment variable is not set.");
  process.exit(1);
}

// --- YAPI 客户端实例化 ---
let yapiClient: YapiClient;
try {
    yapiClient = new YapiClient(YAPI_BASE_URL, YAPI_PROJECT_TOKEN);
} catch (error) {
    console.error("Error initializing YapiClient:", error);
    process.exit(1);
}

// --- MCP 服务器实例化 ---
const server = new Server(
  {
    name: "@mcp-servers/yapi", // 与 package.json 中的 name 匹配
    version: "0.1.0",       // 与 package.json 中的 version 匹配
  },
  {
    capabilities: {
      tools: {}, // 声明支持 Tools 能力
    },
  }
);

// --- 工具定义 ---
const TOOLS: Tool[] = [
  {
    name: "yapi_get_interface_details",
    description: "获取指定 YAPI 接口的详细信息（包括请求/响应参数、类型、状态等）。",
    inputSchema: zodToJsonSchema(GetInterfaceDetailsArgsSchema) as McpToolInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: "yapi_list_interfaces_by_category",
    description: "获取 YAPI 中指定分类下的所有接口列表（仅包含基本信息如名称、路径、方法）。支持分页。",
    inputSchema: zodToJsonSchema(ListInterfacesByCategoryArgsSchema) as McpToolInputSchema,
    annotations: { readOnlyHint: true }
  },
  {
    name: "yapi_get_project_interface_menu",
    description: "获取当前 YAPI 项目的完整接口菜单，包含所有分类及其下的接口列表（仅含基本信息）。",
    inputSchema: zodToJsonSchema(GetProjectInterfaceMenuArgsSchema) as McpToolInputSchema, // 无参数
    annotations: { readOnlyHint: true }
  },
  {
    name: "yapi_get_project_info",
    description: "获取当前配置 Token 所对应 YAPI 项目的基本信息。",
    inputSchema: zodToJsonSchema(GetProjectInfoArgsSchema) as McpToolInputSchema, // 无参数
    annotations: { readOnlyHint: true }
  }
];

// --- 请求处理 ---

// 处理 ListTools 请求
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error("[MCP Request] ListToolsRequestSchema");
  return { tools: TOOLS };
});

// 处理 CallTool 请求
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  console.error(`[MCP Request] CallToolRequestSchema: ${request.params.name}`);
  console.error(`[MCP Request] Arguments:`, JSON.stringify(request.params.arguments, null, 2));

  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "yapi_get_interface_details": {
        const parsedArgs = GetInterfaceDetailsArgsSchema.parse(args);
        const data = await yapiClient.getInterfaceDetails(parsedArgs.interface_id);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "yapi_list_interfaces_by_category": {
        const parsedArgs = ListInterfacesByCategoryArgsSchema.parse(args);
        const data = await yapiClient.listInterfacesByCategory(
            parsedArgs.category_id,
            parsedArgs.page,
            parsedArgs.limit
        );
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "yapi_get_project_interface_menu": {
        GetProjectInterfaceMenuArgsSchema.parse(args); // 验证参数（虽然为空）
        const data = await yapiClient.getProjectInterfaceMenu();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

       case "yapi_get_project_info": {
        GetProjectInfoArgsSchema.parse(args); // 验证参数（虽然为空）
        const data = await yapiClient.getProjectInfo();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      default:
        console.error(`Unknown tool called: ${name}`);
        return {
          isError: true,
          content: [{ type: "text", text: `Error: Unknown tool name '${name}'` }],
        };
    }
  } catch (error) {
    console.error(`[MCP Error] Error processing tool ${name}:`, error);
    let errorMessage = `Error processing tool ${name}.`;
    if (error instanceof ZodError) {
      // 格式化 Zod 验证错误
      errorMessage = `Invalid arguments for tool ${name}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
    } else if (error instanceof YapiError) {
      errorMessage = `YAPI API Error for tool ${name}: ${error.message}${error.errcode ? ` (Code: ${error.errcode})` : ''}`;
      // 可以在这里根据 errcode 提供更具体的错误信息
    } else if (error instanceof Error) {
      errorMessage = `Internal server error for tool ${name}: ${error.message}`;
    } else {
      errorMessage = `An unknown error occurred while processing tool ${name}.`;
    }
    return {
      isError: true,
      content: [{ type: "text", text: errorMessage }],
    };
  }
});

// --- 服务器启动 ---
async function runServer() {
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
    console.error("YAPI MCP Server running on stdio");
    console.error(`Connected to YAPI instance: ${YAPI_BASE_URL}`);
    // 使用非空断言 '!'
    console.error(`Using project token: ${YAPI_PROJECT_TOKEN!.substring(0, 4)}...`);
  } catch (error) {
    console.error("Failed to connect server:", error);
    process.exit(1);
  }
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});

// --- 优雅退出处理 ---
process.on('SIGINT', async () => {
  console.error('Received SIGINT, shutting down server...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('Received SIGTERM, shutting down server...');
  await server.close();
  process.exit(0);
});