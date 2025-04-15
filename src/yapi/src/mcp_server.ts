import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
// Correct way to import JSON in NodeNext ESM with TypeScript >= 5.3
import pkg from '../package.json' with { type: "json" };
import {
    GetInterfaceDetailsArgsSchema,
    ListInterfacesByCategoryArgsSchema,
    GetProjectInterfaceMenuArgsSchema,
    GetProjectInfoArgsSchema,
} from "./schemas.js";
import { YapiService } from "./yapiService.js";
import { YapiError, ConfigurationError } from "./errors.js";

// Use imported package info
const { name: packageName, version: packageVersion } = pkg;

// --- Helper Type ---
type McpToolInputSchema = {
    type: "object";
    properties?: { [key: string]: unknown };
    required?: string[];
    [key: string]: unknown; // Allow other JSON Schema properties
};

// --- Tool Definitions ---
const TOOLS: Tool[] = [
  {
    name: "yapi_get_interface_details",
    description: "获取指定 YAPI 接口的详细信息（包括请求/响应参数、类型、状态等）。",
    inputSchema: zodToJsonSchema(GetInterfaceDetailsArgsSchema) as McpToolInputSchema,
    annotations: { readOnlyHint: true, title: "Get YAPI Interface Details" }
  },
  {
    name: "yapi_list_interfaces_by_category",
    description: "获取 YAPI 中指定分类下的所有接口列表（仅包含基本信息如名称、路径、方法）。支持分页。",
    inputSchema: zodToJsonSchema(ListInterfacesByCategoryArgsSchema) as McpToolInputSchema,
    annotations: { readOnlyHint: true, title: "List YAPI Interfaces by Category"}
  },
  {
    name: "yapi_get_project_interface_menu",
    description: "获取当前 YAPI 项目的完整接口菜单，包含所有分类及其下的接口列表（仅含基本信息）。",
    inputSchema: zodToJsonSchema(GetProjectInterfaceMenuArgsSchema) as McpToolInputSchema,
    annotations: { readOnlyHint: true, title: "Get YAPI Project Menu" }
  },
  {
    name: "yapi_get_project_info",
    description: "获取当前配置 Token 所对应 YAPI 项目的基本信息。",
    inputSchema: zodToJsonSchema(GetProjectInfoArgsSchema) as McpToolInputSchema,
    annotations: { readOnlyHint: true, title: "Get YAPI Project Info" }
  }
];

/**
 * Creates and configures the MCP Server instance.
 * @param yapiService - An instance of the YapiService to handle API calls.
 * @returns The configured McpServer instance.
 */
export function createMcpServer(yapiService: YapiService): McpServer {
    const server = new McpServer(
      {
        name: packageName, // Use name from package.json
        version: packageVersion, // Use version from package.json
      },
      {
        capabilities: {
          tools: {}, // Declare support for Tools capability
        },
      }
    );

    // --- Request Handlers ---

    // Handle ListTools requests
    server.setRequestHandler(ListToolsRequestSchema, async () => {
        console.error("[MCP Request] ListToolsRequestSchema");
        return { tools: TOOLS };
    });

    // Handle CallTool requests
    server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
        const { name, arguments: args } = request.params;
        console.error(`[MCP Request] CallToolRequestSchema: ${name}`);
        console.error(`[MCP Request] Arguments:`, JSON.stringify(args, null, 2));

        try {
            let data: any; // To store the result from YapiService

            switch (name) {
            case "yapi_get_interface_details": {
                const parsedArgs = GetInterfaceDetailsArgsSchema.parse(args);
                data = await yapiService.getInterfaceDetails(parsedArgs.interface_id);
                break;
            }
            case "yapi_list_interfaces_by_category": {
                const parsedArgs = ListInterfacesByCategoryArgsSchema.parse(args);
                data = await yapiService.listInterfacesByCategory(
                    parsedArgs.category_id,
                    parsedArgs.page,
                    parsedArgs.limit
                );
                break;
            }
            case "yapi_get_project_interface_menu": {
                GetProjectInterfaceMenuArgsSchema.parse(args); // Validate empty args
                data = await yapiService.getProjectInterfaceMenu();
                break;
            }
            case "yapi_get_project_info": {
                GetProjectInfoArgsSchema.parse(args); // Validate empty args
                data = await yapiService.getProjectInfo();
                break;
            }
            default:
                console.error(`Unknown tool called: ${name}`);
                return {
                    isError: true,
                    content: [{ type: "text", text: `Error: Unknown tool name '${name}'` }],
                };
            }

            // Successfully got data, format it as JSON string for the LLM
            return {
                content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
            };

        } catch (error) {
            console.error(`[MCP Error] Error processing tool ${name}:`, error);
            let errorMessage = `Error processing tool ${name}.`;
            let isInputError = false;

            if (error instanceof ZodError) {
                isInputError = true;
                errorMessage = `Invalid arguments for tool ${name}: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
            } else if (error instanceof YapiError) {
                errorMessage = `YAPI API Error for tool ${name}: ${error.message}${error.errcode ? ` (Code: ${error.errcode})` : ''}${error.status ? ` (HTTP Status: ${error.status})` : ''}`;
                 // Consider specific YAPI error codes if needed
                 // if (error.errcode === SPECIFIC_CODE) { ... }
            } else if (error instanceof ConfigurationError) {
                 errorMessage = `Configuration Error for tool ${name}: ${error.message}`;
            } else if (error instanceof Error) {
                errorMessage = `Internal server error for tool ${name}: ${error.message}`;
            } else {
                errorMessage = `An unknown error occurred while processing tool ${name}.`;
            }

            // Return structured error
            return {
                isError: true,
                content: [{ type: "text", text: errorMessage }],
                 // Optionally add structured error data if useful for the client/LLM
                // errorData: {
                //     type: isInputError ? 'InputValidationError' : (error instanceof YapiError ? 'YapiApiError' : 'ServerError'),
                //     details: error instanceof Error ? error.stack : String(error) // Be cautious about exposing stack traces
                // }
            };
        }
    });

    return server;
}