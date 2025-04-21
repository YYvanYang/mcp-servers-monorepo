# YAPI MCP Server

This project provides a Model Context Protocol (MCP) server that acts as a bridge between MCP clients (like LLM applications or IDE extensions) and a YAPI instance. It allows clients to query YAPI interface information using standardized MCP tools.

This server supports both **stdio** and **Streamable HTTP** transports.

**Features:**

*   Connects to a specified YAPI instance using a project token.
*   Provides MCP tools to:
    *   Get detailed information for a specific YAPI interface (`yapi_get_interface_details`).
    *   List interfaces within a specific category, with pagination (`yapi_list_interfaces_by_category`).
    *   Retrieve the full project interface menu (categories and basic interface info) (`yapi_get_project_interface_menu`).
    *   Fetch basic information about the configured YAPI project (`yapi_get_project_info`).
*   Supports connection via:
    *   **stdio:** For direct integration where the client launches the server as a subprocess.
    *   **Streamable HTTP:** The standard MCP HTTP transport, allowing the server to run independently and handle multiple client connections via a single `/mcp` endpoint (supporting GET, POST, DELETE).
*   Built with TypeScript and the `@modelcontextprotocol/sdk`.
*   Includes Docker support for easy deployment.

## Prerequisites

*   Node.js (v18.0.0 or later)
*   npm (usually comes with Node.js)
*   Access to a YAPI instance and a Project Token.

## Building the Server

1.  **Clone the repository (if you haven't already):**
    ```bash
    # Assuming you are in the monorepo root
    ```
2.  **Install dependencies:**
    ```bash
    npm ci
    ```
3.  **Build the YAPI server package:**
    ```bash
    npm run build -w @mcp-servers/yapi
    ```
    This will compile the TypeScript code into the `src/yapi/dist` directory.

## Configuration

The server requires the following environment variables:

*   `YAPI_BASE_URL`: **(Required)** The base URL of your YAPI instance (e.g., `https://yapi.example.com`). Do **not** include `/api` or other paths.
*   `YAPI_PROJECT_TOKEN`: **(Required)** The token for the YAPI project you want to access. Find this in your YAPI project settings under "Tokens".

Optional configuration:

*   `PORT`: The port for the Streamable HTTP server to listen on. Defaults to `3000`. Setting this variable implies the default transport mode will be `streamable-http`.
*   **Command-line arguments:**
    *   `--transport <mode>` or `-t <mode>`: Specify the transport mode explicitly.
        *   `stdio`: Use standard input/output.
        *   `streamable-http`: Use the Streamable HTTP transport (listens on `PORT`).
        *   *(Default: `streamable-http` if `PORT` env var is set or no transport specified, otherwise `stdio` might be inferred in direct execution contexts).*
    *   `--port <number>` or `-p <number>`: Override the port for Streamable HTTP mode (takes precedence over the `PORT` environment variable).
    *   `--help` or `-h`: Show help message.

## Running the Server

Make sure you have set the required environment variables (`YAPI_BASE_URL`, `YAPI_PROJECT_TOKEN`).

**1. Using stdio:**

   Ideal for local use with clients that manage the server process (like Cursor configured for stdio).

   ```bash
   export YAPI_BASE_URL="YOUR_YAPI_URL"
   export YAPI_PROJECT_TOKEN="YOUR_YAPI_TOKEN"
   node src/yapi/dist/index.js --transport stdio
   ```

**2. Using Streamable HTTP:**

   Run the server as a standalone process. Clients connect via HTTP to the `/mcp` endpoint.

   ```bash
   export YAPI_BASE_URL="YOUR_YAPI_URL"
   export YAPI_PROJECT_TOKEN="YOUR_YAPI_TOKEN"
   export PORT=3000 # Optional, defaults to 3000

   # Start the server (defaults to streamable-http if PORT is set)
   node src/yapi/dist/index.js
   # Or explicitly:
   # node src/yapi/dist/index.js --transport streamable-http --port 3000
   ```

   The server will be available at `http://localhost:3000/mcp` (or the configured port).

**3. Using Docker:**

   Build the Docker image first using the provided script:

   ```bash
   ./build-yapi-docker.sh
   ```

   Then run the container:

   *   **Streamable HTTP (Default):**
       ```bash
       docker run -d --name yapi-mcp-server \
         -p 3000:3000 \
         -e YAPI_BASE_URL="YOUR_YAPI_URL" \
         -e YAPI_PROJECT_TOKEN="YOUR_YAPI_TOKEN" \
         yvan919/mcp-server-yapi:latest
       ```
       The server will listen on port 3000 inside the container, mapped to port 3000 on your host. Connect clients to `http://localhost:3000/mcp`.

   *   **stdio:**
       ```bash
       docker run -i --rm \
         -e YAPI_BASE_URL="YOUR_YAPI_URL" \
         -e YAPI_PROJECT_TOKEN="YOUR_YAPI_TOKEN" \
         yvan919/mcp-server-yapi:latest --transport stdio
       ```
       This runs the container interactively using stdio.

## Connecting Clients

*   **stdio:** Configure your MCP client (e.g., in Cursor settings) to launch the server executable (`node src/yapi/dist/index.js --transport stdio`) and provide the necessary environment variables.
*   **Streamable HTTP:** Configure your MCP client to connect to the server's URL, specifically the `/mcp` endpoint (e.g., `http://localhost:3000/mcp`).

## MCP Tools Provided

*   `yapi_get_interface_details`
    *   Description: Get details for a specific YAPI interface.
    *   Input: `{ "interface_id": number }`
*   `yapi_list_interfaces_by_category`
    *   Description: List interfaces in a category (paginated).
    *   Input: `{ "category_id": number, "page"?: number, "limit"?: number }`
*   `yapi_get_project_interface_menu`
    *   Description: Get the full interface menu for the project.
    *   Input: `{}`
*   `yapi_get_project_info`
    *   Description: Get basic info for the configured project.
    *   Input: `{}`

*(All tools are read-only)*

## Development

*   **Watch Mode:** `npm run watch -w @mcp-servers/yapi` to automatically recompile on changes.

## License

MIT License - see [LICENSE](../LICENSE) file.