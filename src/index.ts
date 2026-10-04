import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { GameBridge } from "./bridge.js";
import { defaultBlocklandRoot, loadOrCreateToken, tokenPath } from "./token.js";
import { registerTools } from "./tools.js";

const HTTP_PORT = Number(process.env.MCP_HTTP_PORT || 9887);
const GAME_PORT = Number(process.env.MCP_GAME_PORT || 9878);
const HOST = "127.0.0.1";

const blocklandRoot = defaultBlocklandRoot();
const token = await loadOrCreateToken(blocklandRoot);
const bridge = new GameBridge({ port: GAME_PORT, token });

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function isLocalHostHeader(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h.startsWith("localhost:") ||
    h === "localhost" ||
    h.startsWith("127.0.0.1:") ||
    h === "127.0.0.1" ||
    h.startsWith("[::1]:") ||
    h === "[::1]"
  );
}

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser clients omit Origin
  const o = origin.toLowerCase();
  if (o === "null") return true;
  if (o.startsWith("http://localhost")) return true;
  if (o.startsWith("http://127.0.0.1")) return true;
  if (o.startsWith("vscode-file://")) return true;
  if (o.startsWith("vscode-webview://")) return true;
  if (o.includes("cursor")) return true;
  return false;
}

function checkAuth(req: Request, res: Response): boolean {
  const header = req.headers.authorization || "";
  const expected = `Bearer ${token}`;
  if (!timingSafeEqualStr(header, expected)) {
    const q = typeof req.query.token === "string" ? req.query.token : "";
    if (!timingSafeEqualStr(q, token)) {
      res.status(401).json({ error: "unauthorized" });
      return false;
    }
  }

  const host = String(req.headers.host || "");
  if (!isLocalHostHeader(host)) {
    res.status(403).json({ error: "forbidden host", host });
    return false;
  }

  const origin = req.headers.origin;
  if (typeof origin === "string" && !isAllowedOrigin(origin)) {
    res.status(403).json({ error: "forbidden origin", origin });
    return false;
  }

  return true;
}

function createGameServer(): McpServer {
  const server = new McpServer({
    name: "blockland-mcp",
    version: "1.0.0",
  });
  registerTools(server, bridge, blocklandRoot);
  return server;
}

const app = express();
app.use(express.json({ limit: "4mb" }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(
    `[mcp] ${req.method} ${req.path} host=${req.headers.host || "-"} origin=${req.headers.origin || "-"} auth=${req.headers.authorization ? "yes" : "no"} session=${req.headers["mcp-session-id"] || "-"}`
  );
  next();
});

// Prevent Cursor from entering OAuth discovery instead of bearer headers
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.status(404).end();
});
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.status(404).end();
});
app.get("/.well-known/oauth-protected-resource/*path", (_req, res) => {
  res.status(404).end();
});

type Session = {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
};
const sessions: Record<string, Session> = {};

async function handleMcpPost(req: Request, res: Response): Promise<void> {
  if (!checkAuth(req, res)) return;

  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  try {
    const session = sessionId ? sessions[sessionId] : undefined;

    if (session) {
      await session.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const server = createGameServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions[id] = { transport, server };
          console.log(`[mcp] session initialized ${id}`);
        },
      });

      transport.onclose = () => {
        const id = transport.sessionId;
        if (id && sessions[id]) {
          delete sessions[id];
          console.log(`[mcp] session closed ${id}`);
        }
      };

      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: No valid session ID provided" },
      id: null,
    });
  } catch (error) {
    console.error("MCP POST error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

async function handleMcpGetDelete(req: Request, res: Response): Promise<void> {
  if (!checkAuth(req, res)) return;
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await sessions[sessionId].transport.handleRequest(req, res);
}

app.post("/", handleMcpPost);
app.post("/mcp", handleMcpPost);
app.get("/", handleMcpGetDelete);
app.get("/mcp", handleMcpGetDelete);
app.delete("/", handleMcpGetDelete);
app.delete("/mcp", handleMcpGetDelete);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    gamePort: GAME_PORT,
    blocklandRoot,
    tokenFile: tokenPath(blocklandRoot),
  });
});

const httpServer = createServer(app);
httpServer.listen(HTTP_PORT, HOST, () => {
  console.log(`blockland-mcp listening on http://localhost:${HTTP_PORT}/`);
  console.log(`Game TCP bridge expected at 127.0.0.1:${GAME_PORT}`);
  console.log(`Token file: ${tokenPath(blocklandRoot)}`);
  console.log(`Cursor mcp.json snippet:`);
  console.log(
    JSON.stringify(
      {
        "blockland-mcp": {
          type: "streamable-http",
          url: `http://localhost:${HTTP_PORT}/`,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
      null,
      2
    )
  );
});

async function shutdown() {
  console.log("Shutting down...");
  bridge.close();
  for (const id of Object.keys(sessions)) {
    await sessions[id].transport.close();
    await sessions[id].server.close();
    delete sessions[id];
  }
  httpServer.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
