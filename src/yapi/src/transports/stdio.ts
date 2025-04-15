import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { YapiService } from "../yapiService.js";

/**
 * Starts the MCP server using the STDIO transport.
 * @param server - The configured McpServer instance.
 * @param yapiService - The configured YapiService instance.
 */
export async function runStdioServer(server: McpServer, yapiService: YapiService): Promise<void> {
    const transport = new StdioServerTransport();
    try {
        await server.connect(transport);
        // Use console.error for status messages, not console.log
        console.error("YAPI MCP Server running on stdio");
        console.error(`Connected to YAPI instance: ${yapiService.getBaseUrl()}`);
    } catch (error) {
        console.error("Failed to connect STDIO server:", error);
        throw error; // Re-throw to be caught by main handler
    }
}