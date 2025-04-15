import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import http from 'http'; // Import http module for server instance
import { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { YapiService } from "../yapiService.js";

// Define an interface for active transports for better type safety
interface ActiveTransports {
    [sessionId: string]: SSEServerTransport;
}

/**
 * Starts the MCP server using the SSE transport via an Express app.
 * Returns the running HTTP server instance for graceful shutdown.
 */
export function runSseServer(mcpServer: McpServer, yapiService: YapiService, port: number): http.Server {
    const app = express();
    const activeTransports: ActiveTransports = {};

    // --- Middleware ---
    app.use(cors({
        origin: '*', // Adjust for production
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Accept'],
    }));
    app.use((req: Request, res: Response, next: NextFunction) => {
        const startTime = Date.now();
        console.error(`[HTTP Request] ${req.method} ${req.originalUrl} from ${req.ip}`);
        res.on('finish', () => {
            const duration = Date.now() - startTime;
            console.error(`[HTTP Response] ${req.method} ${req.originalUrl} - Status: ${res.statusCode} (${duration}ms)`);
        });
        next();
    });

    // --- SSE Endpoint (/sse) ---
    app.get('/sse', async (req: Request, res: Response) => {
        console.error(`[SSE] New client connecting... IP: ${req.ip}`);

        const postMessagesUrl = '/messages';
        let transport: SSEServerTransport | null = null;

        try {
            transport = new SSEServerTransport(postMessagesUrl, res);
            const sessionId = transport.sessionId;
            activeTransports[sessionId] = transport;
            console.log(`[SSE] Client connected. Session ID: ${sessionId}`);

            req.on('close', () => {
                console.error(`[SSE] Client disconnected: ${sessionId}`);
                if (activeTransports[sessionId]) {
                    // Removed mcpServer.disconnect(activeTransports[sessionId]);
                    // The SDK handles cleanup internally when transport closes
                    delete activeTransports[sessionId];
                    console.log(`[SSE] Cleaned up transport map for ${sessionId}`);
                } else {
                     console.warn(`[SSE] Attempted cleanup for non-existent transport: ${sessionId}`);
                }
            });

            await mcpServer.connect(transport);
            console.log(`[MCP] Server connected via SSE transport for session: ${sessionId}`);

        } catch (error) {
            console.error(`[SSE/MCP Connect Error] Session ${transport?.sessionId || 'unknown'}:`, error);
            if (transport && activeTransports[transport.sessionId]) {
                 delete activeTransports[transport.sessionId];
            }
            if (!res.headersSent) {
                res.status(500).send({ error: 'Server connection setup failed' });
            } else if (!res.writableEnded) {
                 res.end();
            }
        }
    });

    // --- Messages Endpoint (/messages) ---
    // Explicitly type the handler to return Promise<void> to satisfy express types
    app.post('/messages', express.raw({ type: 'application/json-rpc', limit: '10mb' }), async (req: Request, res: Response): Promise<void> => {
        const sessionId = req.query.sessionId as string;

        if (!sessionId) {
            console.error("[POST /messages] Error: Missing sessionId query parameter");
            // Ensure response is sent and function exits
            res.status(400).json({ error: 'Missing sessionId query parameter' });
            return;
        }

        const transport = activeTransports[sessionId];
        if (!transport) {
            console.error(`[POST /messages] Error: No active transport found for sessionId: ${sessionId}`);
             // Ensure response is sent and function exits
            res.status(404).json({ error: `No active transport found for sessionId: ${sessionId}` });
            return;
        }

        console.log(`[POST /messages] Handling message for session: ${sessionId}`);
        try {
            await transport.handlePostMessage(req, res);
            // Response is handled by handlePostMessage, nothing more needed here
        } catch (error) {
            console.error(`[POST /messages] Error handling message for session ${sessionId}:`, error);
            if (!res.headersSent) {
                 res.status(500).json({ error: 'Internal Server Error handling message' });
            }
            // If headers were sent, handlePostMessage likely already sent an error response
        }
        // Explicit return is not strictly necessary for async void, but can help clarity
        return;
    });

    // --- Express Not Found Handler ---
    app.use((req: Request, res: Response) => {
        console.warn(`[HTTP Not Found] ${req.method} ${req.originalUrl}`);
        res.status(404).json({ error: 'Not Found' });
    });


    // --- Express Global Error Handler ---
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        console.error("[Express Global Error Handler]", err);
        const statusCode = err.status || err.statusCode || 500;
        const message = err.message || 'Internal Server Error';
        if (!res.headersSent) {
            res.status(statusCode).json({ error: message });
        } else {
            console.error("Error occurred after headers were sent. Cannot send error response.");
            if (!res.writableEnded) {
                 res.end();
            }
        }
    });


    // --- Start Listening ---
    const httpServer = http.createServer(app);
    httpServer.listen(port, () => {
        console.log(`YAPI MCP Server (SSE) running on http://localhost:${port}`);
        console.log(`SSE Endpoint: /sse`);
        console.log(`Messages Endpoint: /messages`);
        console.log(`Connected to YAPI instance: ${yapiService.getBaseUrl()}`);
    });

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

    return httpServer;
}