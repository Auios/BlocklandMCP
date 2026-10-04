import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function defaultBlocklandRoot(): string {
  const raw = process.env.BLOCKLAND_ROOT?.trim();
  if (!raw) {
    throw new Error(
      "BLOCKLAND_ROOT is required. Set it to the folder that contains Blockland.exe."
    );
  }

  const root = path.resolve(raw);
  const exe = path.join(root, "Blockland.exe");
  if (!existsSync(exe)) {
    throw new Error(
      `BLOCKLAND_ROOT does not look like a Blockland install (missing Blockland.exe): ${root}`
    );
  }

  return root;
}

export function tokenPath(blocklandRoot: string): string {
  return path.join(blocklandRoot, "config", "mcp", "token");
}

export async function loadOrCreateToken(blocklandRoot: string): Promise<string> {
  if (process.env.MCP_TOKEN?.trim()) {
    return process.env.MCP_TOKEN.trim();
  }

  const file = tokenPath(blocklandRoot);
  await mkdir(path.dirname(file), { recursive: true });

  try {
    await access(file);
    const existing = (await readFile(file, "utf8")).trim();
    if (existing) {
      return existing;
    }
  } catch {
    // create below
  }

  const token = randomBytes(16).toString("hex");
  await writeFile(file, `${token}\n`, "utf8");
  console.error(`Client_MCP token written to ${file}`);
  return token;
}
