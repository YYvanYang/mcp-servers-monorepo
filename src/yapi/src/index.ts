#!/usr/bin/env node

import { parseArgs } from 'node:util';
import http from 'http'; // For Streamable HTTP server instance type
import { YapiService } from './yapiService.js';
import { createMcpServer } from './mcp_server.js';
import { runStdioServer } from './transports/stdio.js';
import { runStreamableHttpServer } from './transports/streamableHttp.js'; // Import the new transport runner
import { ConfigurationError } from './errors.js';

// --- Argument Parsing Setup ---
const optionsDefinition = {
  transport: {
    type: 'string' as const,
    short: 't',
    description: "Transport mode: 'stdio' or 'streamable-http'.",
  },
  port: {
    type: 'string' as const,
    short: 'p',
    description: "Port for Streamable HTTP transport.",
  },
  help: {
    type: 'boolean' as const,
    short: 'h',
    description: 'Show this help message.',
  },
};

function printUsage() {
    // Use console.error for usage/help output as it's not protocol data
    console.error(`
Usage: mcp-server-yapi [options]

Options:
  -t, --transport <mode>  Transport mode: 'stdio' or 'streamable-http'.
                          (Default: 'streamable-http' if PORT env var is set or no transport specified, 'stdio' otherwise in specific scenarios if needed)
  -p, --port <number>     Port for Streamable HTTP transport.
                          (Default: PORT env var or 3000)
  -h, --help              Show this help message

Environment Variables:
  YAPI_BASE_URL           (Required) Base URL of the YAPI instance (e.g., http://yapi.example.com, without /api)
  YAPI_PROJECT_TOKEN      (Required) Project token for YAPI API access
  PORT                    (Optional) Default port for Streamable HTTP transport if --port is not set.
                          If PORT is set and --transport is not, defaults to 'streamable-http'.
`);
}

// --- Determine Defaults based on Environment ---
const defaultPort = process.env.PORT || '3000';
// Default to streamable-http unless explicitly set otherwise, especially if PORT is defined.
// Stdio is usually explicitly chosen or inferred in specific execution contexts (like direct process launch).
const defaultTransport = process.env.PORT ? 'streamable-http' : (process.argv.includes('--transport') ? 'stdio' : 'streamable-http'); // Sensible default

// --- Parse Arguments ---
let parsedArgs;
try {
  parsedArgs = parseArgs({
    options: optionsDefinition,
    allowPositionals: false, // No positional arguments expected
    strict: true // Throw on unknown args
  });
} catch (e) {
  console.error(`Error parsing arguments: ${e instanceof Error ? e.message : String(e)}`);
  printUsage();
  process.exit(1);
}

const { values: args } = parsedArgs;

if (args.help) {
  printUsage();
  process.exit(0);
}

// --- Configuration ---
const YAPI_BASE_URL = process.env.YAPI_BASE_URL;
const YAPI_PROJECT_TOKEN = process.env.YAPI_PROJECT_TOKEN;
const transportMode = (args.transport || defaultTransport).toLowerCase();
const httpPortString = args.port || defaultPort;
const httpPort = parseInt(httpPortString, 10);

// --- Main Application Logic ---
async function main() {
  let yapiService: YapiService;
  try {
    // Environment variable check happens inside YapiService constructor now
    yapiService = new YapiService(YAPI_BASE_URL, YAPI_PROJECT_TOKEN);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(`Configuration Error: ${error.message}\n`);
      printUsage();
    } else {
      console.error("Error initializing YapiService:", error);
    }
    process.exit(1);
  }

  const mcpServer = createMcpServer(yapiService);
  let httpServer: http.Server | undefined; // Hold the Streamable HTTP server instance

  try {
    if (transportMode === 'streamable-http') {
      if (isNaN(httpPort) || httpPort <= 0 || httpPort > 65535) {
           console.error(`Invalid port number: '${httpPortString}'. Port must be between 1 and 65535.`);
           printUsage();
           process.exit(1);
      }
      // Use console.error for server status logs
      console.error(`Starting server in Streamable HTTP mode on port ${httpPort}...`);
      // runStreamableHttpServer now returns the http.Server instance
      httpServer = runStreamableHttpServer(mcpServer, yapiService, httpPort);
    } else if (transportMode === 'stdio') {
      // Use console.error for server status logs
      console.error("Starting server in STDIO mode...");
      await runStdioServer(mcpServer, yapiService);
    } else {
      console.error(`Invalid transport mode: '${transportMode}'. Use 'stdio' or 'streamable-http'.`);
      printUsage();
      process.exit(1);
    }
  } catch (error) {
    console.error("Fatal error starting server:", error);
    process.exit(1);
  }

  // --- Graceful Shutdown Logic ---
  const shutdown = async (signal: string) => {
    console.error(`\nReceived ${signal}, initiating graceful shutdown...`);
    try {
      console.error("Closing MCP server connections...");
      // This should trigger closing of all connected transports
      await mcpServer.close();
      console.error("MCP Server connections closed.");

      if (httpServer) {
        console.error("Closing HTTP server...");
        await new Promise<void>((resolve, reject) => {
          // Added a timeout for server closing
          const timeoutId = setTimeout(() => {
            console.error("HTTP server close timeout reached, forcing exit.");
            reject(new Error("Server close timeout"));
          }, 5000); // 5 seconds timeout

          httpServer!.close((err) => {
            clearTimeout(timeoutId); // Clear the timeout if close finishes normally
            if (err) {
              console.error("Error closing HTTP server:", err);
              reject(err);
            } else {
              console.error("HTTP server closed.");
              resolve();
            }
          });
        }).catch(err => {
            console.error("Forcing exit due to shutdown error/timeout:", err);
            process.exit(1); // Force exit on timeout/error during close
        });
      }
      console.error("Shutdown complete.");
      process.exit(0);
    } catch (shutdownError) {
      console.error("Error during shutdown:", shutdownError);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

}

// --- Run Main ---
main().catch((error) => {
  console.error("Unhandled error during application startup:", error);
  process.exit(1);
});