# Blockland MCP

Give Cursor (or any MCP client) access to a running **Blockland client**: execute TorqueScript, read player state, move the character, and take screenshots.

```
Cursor  --stdio-->  blockland-mcp  --TCP 127.0.0.1:9878-->  Client_MCP  -->  Blockland.exe
```

Website: [bldb.auios.com/mcp](https://bldb.auios.com/mcp)

> **Warning: this is remote code execution by design**
>
> The shared token **is** the root password. Anyone holding it can run arbitrary TorqueScript in your game client.
>
> - **Never** share, screenshot, or commit the token.
> - **Never** port-forward the listeners or expose them past localhost.
> - Both sides bind/expect loopback only.

## Setup

### 1. Install the add-on

1. Copy `addon/Client_MCP` into your game folder as `Add-Ons/Client_MCP`.
2. Launch Blockland (client).
3. Enable **Client_MCP** in Add-Ons and restart the client if needed.
4. In the console you should see:
   - `Client_MCP: listening on TCP port 9878`
   - `Client_MCP: token file config/mcp/token`

The add-on creates `config/mcp/token` under the game folder on first run.

### 2. Install the sidecar

```bash
git clone https://github.com/Auios/BlocklandMCP.git
cd BlocklandMCP
npm install
```

### 3. Wire Cursor

Edit MCP settings (`mcp.json`). Set `cwd` to this clone and `BLOCKLAND_ROOT` to the folder that contains `Blockland.exe`:

```json
{
  "mcpServers": {
    "blockland-mcp": {
      "command": "npx",
      "args": ["tsx", "src/stdio.ts"],
      "cwd": "C:\\path\\to\\BlocklandMCP",
      "env": {
        "BLOCKLAND_ROOT": "C:\\path\\to\\Blockland",
        "MCP_GAME_PORT": "9878"
      }
    }
  }
}
```

On macOS/Linux, use forward-slash paths. Reload MCP servers in Cursor after saving.

`BLOCKLAND_ROOT` is required. The sidecar refuses to start if that folder does not contain `Blockland.exe`.

### 4. Smoke test

With Blockland running and Client_MCP listening:

```bash
set BLOCKLAND_ROOT=C:\path\to\Blockland
npm run smoke
```

Then in Cursor try `get_player_state`, `take_screenshot`, `execute_script` (`echo("mcp-ok");`), and `control_character` (`pulseForward` with value `200`).

## MCP tools

| Tool | Purpose |
|------|---------|
| `execute_script` | Eval TorqueScript (`echo(...)` or `$Mcp::Result = "..."` to return text) |
| `get_player_state` | Local control-object / player snapshot |
| `control_character` | `stop`, `forward`, `backward`, `left`, `right`, `jump`, `crouch`, `click`, `fire`, `yaw`, `pitch`, `lookAt`, `pulseForward` |
| `take_screenshot` | `doScreenShot()` and return the PNG |

## Optional HTTP mode

For non-Cursor clients that speak Streamable HTTP:

```bash
set BLOCKLAND_ROOT=C:\path\to\Blockland
npm start
```

Listens on `http://127.0.0.1:9887/` with bearer auth using the same token file.

| Variable | Default | Meaning |
|----------|---------|---------|
| `BLOCKLAND_ROOT` | *(required)* | Folder that contains `Blockland.exe` |
| `MCP_HTTP_PORT` | `9887` | Streamable HTTP port (`npm start`) |
| `MCP_GAME_PORT` | `9878` | Client_MCP TCP port |
| `MCP_TOKEN` | (read/create token file) | Override shared token |

## Layout

```
addon/Client_MCP/     TorqueScript client add-on
src/                  Node MCP sidecar (stdio + optional HTTP)
config/mcp/token      created in the *game* folder, not this repo
```

## Out of scope

- Dedicated-server MCP / world admin bridge
- Native in-process DLL MCP host
