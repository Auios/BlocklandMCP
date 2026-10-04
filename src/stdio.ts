/**
 * Stdio MCP entry — Cursor launches this locally (most reliable discovery).
 * Still talks to Client_MCP over TCP 9878.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GameBridge } from "./bridge.js";
import { defaultBlocklandRoot, loadOrCreateToken } from "./token.js";
import { registerTools } from "./tools.js";

const GAME_PORT = Number(process.env.MCP_GAME_PORT || 9878);
const blocklandRoot = defaultBlocklandRoot();
const token = await loadOrCreateToken(blocklandRoot);
const bridge = new GameBridge({ port: GAME_PORT, token });

const server = new McpServer({
  name: "blockland-mcp",
  version: "1.0.0",
});
registerTools(server, bridge, blocklandRoot);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", () => {
  bridge.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  bridge.close();
  process.exit(0);
});
