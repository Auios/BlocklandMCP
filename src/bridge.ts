import net from "node:net";
import { randomUUID } from "node:crypto";

export type BridgeOptions = {
  host?: string;
  port: number;
  token: string;
  connectTimeoutMs?: number;
  requestTimeoutMs?: number;
};

function escapePayload(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "");
}

function unescapePayload(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) {
      const n = text[i + 1];
      if (n === "n") {
        out += "\n";
        i++;
        continue;
      }
      if (n === "\\") {
        out += "\\";
        i++;
        continue;
      }
    }
    out += c;
  }
  return out;
}

export class GameBridge {
  private readonly host: string;
  private readonly port: number;
  private readonly token: string;
  private readonly connectTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private socket: net.Socket | null = null;
  private buffer = "";
  private authed = false;
  private readonly pending = new Map<
    string,
    { resolve: (v: string) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private connectPromise: Promise<void> | null = null;

  constructor(opts: BridgeOptions) {
    this.host = opts.host ?? "127.0.0.1";
    this.port = opts.port;
    this.token = opts.token;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 3000;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 15000;
  }

  async request(cmd: string, payload = ""): Promise<string> {
    await this.ensureConnected();
    const id = randomUUID().replace(/-/g, "").slice(0, 12);
    const line = `REQ ${id} ${cmd}${payload ? ` ${escapePayload(payload)}` : ""}`;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Game bridge timeout waiting for ${cmd} (${id})`));
      }, this.requestTimeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.socket!.write(`${line}\r\n`);
    });
  }

  close(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("Bridge closed"));
    }
    this.pending.clear();
    this.socket?.destroy();
    this.socket = null;
    this.authed = false;
    this.connectPromise = null;
  }

  private ensureConnected(): Promise<void> {
    if (this.socket && !this.socket.destroyed && this.authed) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    this.connectPromise = this.connect().finally(() => {
      this.connectPromise = null;
    });
    return this.connectPromise;
  }

  private connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.authed = false;
      this.buffer = "";
      const socket = net.createConnection({ host: this.host, port: this.port });
      this.socket = socket;

      const fail = (err: Error) => {
        cleanup();
        this.socket = null;
        this.authed = false;
        reject(err);
      };

      const onTimeout = () => fail(new Error(
        `Cannot connect to Blockland Client_MCP at ${this.host}:${this.port}. Is the game running with Client_MCP enabled?`
      ));

      const timer = setTimeout(onTimeout, this.connectTimeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        socket.off("error", onError);
      };

      const onError = (err: Error) => fail(err);

      socket.on("error", onError);
      socket.setEncoding("utf8");

      socket.on("data", (chunk: string) => {
        this.buffer += chunk;
        let idx: number;
        while ((idx = this.buffer.search(/\r?\n/)) >= 0) {
          const line = this.buffer.slice(0, idx).replace(/\r$/, "");
          this.buffer = this.buffer.slice(idx + (this.buffer[idx] === "\r" ? 2 : 1));
          this.onLine(line, () => {
            cleanup();
            resolve();
          }, fail);
        }
      });

      socket.on("close", () => {
        this.authed = false;
        this.socket = null;
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error("Game bridge disconnected"));
        }
        this.pending.clear();
      });

      socket.on("connect", () => {
        socket.write(`AUTH ${this.token}\r\n`);
      });
    });
  }

  private onLine(
    line: string,
    onAuthed: () => void,
    onAuthFail: (err: Error) => void
  ): void {
    if (!line) return;

    if (!this.authed) {
      if (line.startsWith("HELLO")) return;
      if (line === "AUTH_OK") {
        this.authed = true;
        onAuthed();
        return;
      }
      if (line === "AUTH_FAIL" || line === "AUTH_REQUIRED") {
        onAuthFail(new Error(`Client_MCP auth failed (${line}). Check config/mcp/token.`));
        this.socket?.destroy();
        return;
      }
      return;
    }

    const mode = line.split(" ", 1)[0];
    if (mode === "OK" || mode === "ERR") {
      const rest = line.slice(mode.length + 1);
      const sp = rest.indexOf(" ");
      const id = sp < 0 ? rest : rest.slice(0, sp);
      const payload = sp < 0 ? "" : unescapePayload(rest.slice(sp + 1));
      const pending = this.pending.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      if (mode === "OK") pending.resolve(payload);
      else pending.reject(new Error(payload || "game error"));
    }
  }
}
