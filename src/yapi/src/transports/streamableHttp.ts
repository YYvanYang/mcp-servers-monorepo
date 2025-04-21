import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http';
import { randomUUID } from 'node:crypto';
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { YapiService } from "../yapiService.js";
// Optional: Use an in-memory event store for basic resumability example
// import { InMemoryEventStore } from "../../../examples/shared/inMemoryEventStore.js"; // Adjust path if using

// Define an interface for active transports for better type safety
interface ActiveStreamableTransports {
    [sessionId: string]: StreamableHTTPServerTransport;
}

/**
 * Starts the MCP server using the Streamable HTTP transport via an Express app.
 * Returns the running HTTP server instance for graceful shutdown.
 */
export function runStreamableHttpServer(mcpServer: McpServer, yapiService: YapiService, port: number): http.Server {
    const app = express();
    const activeTransports: ActiveStreamableTransports = {};

    // --- Middleware ---
    app.use(cors({
        origin: '*', // Adjust for production: specific origins or function
        methods: ['GET', 'POST', 'DELETE'], // Allow DELETE for session termination
        allowedHeaders: ['Content-Type', 'Accept', 'Mcp-Session-Id', 'Last-Event-ID'], // Add MCP specific headers
        exposedHeaders: ['Mcp-Session-Id'], // Expose session ID header to clients
    }));
    app.use(express.json({ limit: '10mb' })); // Parse JSON bodies

    app.use((req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        // Use console.error for operational logging
        console.error(`[HTTP Request] ${req.method} ${req.originalUrl} from ${req.ip} Session: ${req.headers['mcp-session-id'] || 'N/A'}`);
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            console.error(`[HTTP Response] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
        });
        next();
    });

    // --- Unified MCP Endpoint (/mcp) ---
    // Handles GET, POST, DELETE for Streamable HTTP
    app.all('/mcp', async (req: Request, res: Response) => {
        console.error(`[MCP Endpoint] Handling ${req.method} request`);
        const sessionId = req.headers['mcp-session-id'] as string | undefined;
        let transport: StreamableHTTPServerTransport;

        try {
            if (sessionId && activeTransports[sessionId]) {
                // Session exists, reuse transport
                transport = activeTransports[sessionId];
                console.error(`[MCP Endpoint] Reusing transport for session: ${sessionId}`);
            } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
                // New session initialization via POST
                console.error('[MCP Endpoint] Initializing new session...');
                // Optional: const eventStore = new InMemoryEventStore();
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    // eventStore, // Enable resumability if using EventStore
                    onsessioninitialized: (newSessionId) => {
                        console.error(`[MCP Transport] Session initialized: ${newSessionId}`);
                        activeTransports[newSessionId] = transport; // Store transport once ID is generated
                    }
                });

                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid && activeTransports[sid]) {
                        console.error(`[MCP Transport] Transport closed for session ${sid}, removing.`);
                        delete activeTransports[sid];
                    }
                };

                // Connect the main MCP Server instance to this *new* transport
                // Crucial: Do this *before* handling the request so the server can respond
                await mcpServer.connect(transport);
                console.error(`[MCP Server] Connected to new transport for session: ${transport.sessionId || '(pending)'}`);

                // Handle the request (initialization) which will also send the response
                await transport.handleRequest(req, res, req.body);
                return; // Request fully handled

            } else if (!sessionId && req.method !== 'POST') {
                 console.error(`[MCP Endpoint] Error: ${req.method} request received without session ID.`);
                 res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: Mcp-Session-Id header required for this request.' }, id: null });
                 return;
            } else if (sessionId && !activeTransports[sessionId]) {
                 console.error(`[MCP Endpoint] Error: Session ID ${sessionId} not found.`);
                 res.status(404).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Not Found: Invalid or expired session ID.' }, id: null });
                 return;
            }
            else {
                // Catch other invalid states, e.g. non-initialize POST without session ID
                console.error(`[MCP Endpoint] Error: Invalid request state. Method: ${req.method}, Session ID: ${sessionId}, IsInit: ${isInitializeRequest(req.body)}`);
                res.status(400).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: Invalid request combination.' }, id: null });
                return;
            }

            // Handle GET, subsequent POSTs, or DELETE with the existing transport
            await transport.handleRequest(req, res, req.body);

        } catch (error) {
            console.error(`[MCP Endpoint] Error handling ${req.method} for session ${sessionId || 'N/A'}:`, error);
            if (!res.headersSent) {
                // Determine request ID if possible for JSON-RPC error
                let reqId: string | number | null = null;
                if (req.method === 'POST' && req.body && typeof req.body === 'object') {
                    reqId = Array.isArray(req.body) ? null : req.body.id; // Basic check, might be null for batch
                }
                 res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal Server Error' }, id: reqId });
            } else if (!res.writableEnded) {
                 res.end(); // Attempt to close the connection if possible
            }
        }
    });


    // --- Express Not Found Handler ---
    app.use((req: Request, res: Response) => {
        console.warn(`[HTTP Not Found] ${req.method} ${req.originalUrl}`);
        res.status(404).json({ error: 'Not Found' });
    });


    // --- Express Global Error Handler ---
    // Catches errors from middleware or route handlers
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        console.error("[Express Global Error Handler]", err);
        const statusCode = err.status || err.statusCode || 500;
        const message = err.message || 'Internal Server Error';
        if (!res.headersSent) {
            res.status(statusCode).json({ error: message });
        } else {
            console.error("Error occurred after headers were sent. Cannot send error response.");
            // Attempt to close the connection if still open
            if (!res.writableEnded) {
                 res.end();
            }
        }
    });


    // --- Start Listening ---
    const httpServer = http.createServer(app);
    httpServer.listen(port, () => {
        // Use console.error for server status logs
        console.error(`YAPI MCP Server (Streamable HTTP) running on http://localhost:${port}`);
        console.error(`MCP Endpoint: /mcp (Accepts GET, POST, DELETE)`);
        console.error(`Connected to YAPI instance: ${yapiService.getBaseUrl()}`);
    });

    // Handle server errors like EADDRINUSE
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
        if (error.syscall !== 'listen') throw error;
        switch (error.code) {
            case 'EACCES':
                console.error(`Port ${port} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                console.error(`Port ${port} is already in use`);
                process.exit(1);
                break;
            default:
                console.error(`[HTTP Server Error] Failed to start server:`, error);
                process.exit(1);
        }
    });

    // Return the server instance for graceful shutdown handling
    return httpServer;
}