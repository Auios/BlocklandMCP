import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { GameBridge } from "./bridge.js";

function parseState(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i)] = line.slice(i + 1);
  }
  return out;
}

async function newestScreenshot(
  screenshotsDir: string,
  afterMs: number,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const names = await readdir(screenshotsDir);
      let best: { file: string; mtime: number } | null = null;
      for (const name of names) {
        if (!/\.(png|jpg|jpeg|bmp)$/i.test(name)) continue;
        const file = path.join(screenshotsDir, name);
        const st = await stat(file);
        const mtime = st.mtimeMs;
        if (mtime < afterMs) continue;
        if (!best || mtime > best.mtime) best = { file, mtime };
      }
      if (best) return best.file;
    } catch {
      // dir may not exist yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

export function registerTools(
  server: McpServer,
  bridge: GameBridge,
  blocklandRoot: string
): void {
  const screenshotsDir = path.join(blocklandRoot, "screenshots");

  server.registerTool(
    "execute_script",
    {
      description:
        "Execute TorqueScript in the live Blockland client via Client_MCP. Use echo(...) to return text. The bearer token grants full RCE in the game process.",
      inputSchema: {
        code: z.string().describe("TorqueScript source to eval"),
      },
    },
    async ({ code }) => {
      const result = await bridge.request("eval", code);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.registerTool(
    "get_player_state",
    {
      description:
        "Read local player / control-object state from the connected Blockland client (position, eye, tool, etc.).",
      inputSchema: {},
    },
    async () => {
      const raw = await bridge.request("state");
      const parsed = parseState(raw);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ...parsed, raw }, null, 2),
          },
        ],
      };
    }
  );

  server.registerTool(
    "control_character",
    {
      description:
        "Control the local character: stop, forward, backward, left, right, jump, crouch, click, fire, yaw, pitch, lookAt, pulseForward.",
      inputSchema: {
        action: z
          .enum([
            "stop",
            "forward",
            "backward",
            "left",
            "right",
            "jump",
            "crouch",
            "click",
            "fire",
            "yaw",
            "pitch",
            "lookAt",
            "pulseForward",
          ])
          .describe("Control action"),
        value: z
          .string()
          .optional()
          .describe(
            "Optional value: speed (0-1), on/off (0/1), yaw/pitch radians, lookAt 'x y z', or pulseForward ms"
          ),
      },
    },
    async ({ action, value }) => {
      const payload = value ? `${action} ${value}` : action;
      const result = await bridge.request("control", payload);
      return { content: [{ type: "text" as const, text: result }] };
    }
  );

  server.registerTool(
    "take_screenshot",
    {
      description:
        "Capture a Blockland client screenshot (doScreenShot) and return the PNG image.",
      inputSchema: {},
    },
    async () => {
      const started = Date.now();
      const hint = await bridge.request("screenshot");
      let file: string | null = null;

      if (hint && hint !== "screenshots/" && !hint.endsWith("/")) {
        const candidate = path.isAbsolute(hint)
          ? hint
          : path.join(blocklandRoot, hint.replace(/\//g, path.sep));
        try {
          await stat(candidate);
          file = candidate;
        } catch {
          // fall through to FS wait
        }
      }

      if (!file) {
        file = await newestScreenshot(screenshotsDir, started - 500, 8000);
      }

      if (!file) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Screenshot requested but no new file found under ${screenshotsDir}. Game returned: ${hint}`,
            },
          ],
          isError: true,
        };
      }

      const buf = await readFile(file);
      return {
        content: [
          {
            type: "text" as const,
            text: `Screenshot: ${file}`,
          },
          {
            type: "image" as const,
            data: buf.toString("base64"),
            mimeType: "image/png",
          },
        ],
      };
    }
  );
}
