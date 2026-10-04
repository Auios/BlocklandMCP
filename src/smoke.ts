/**
 * Optional manual TCP smoke test against Client_MCP (game must be running).
 * Usage: npx tsx src/smoke.ts
 */
import { GameBridge } from "./bridge.js";
import { defaultBlocklandRoot, loadOrCreateToken } from "./token.js";

const root = defaultBlocklandRoot();
const token = await loadOrCreateToken(root);
const bridge = new GameBridge({
  port: Number(process.env.MCP_GAME_PORT || 9878),
  token,
});

try {
  const state = await bridge.request("state");
  console.log("state:\n" + state);
  const evalResult = await bridge.request("eval", 'echo("mcp-smoke-ok");');
  console.log("eval:\n" + evalResult);
  console.log("OK");
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  bridge.close();
}
