// Client_MCP — localhost TCP bridge for the Blockland MCP sidecar
exec("./config.cs");
exec("./protocol.cs");
exec("./commands.cs");

function mcp_reload()
{
	exec("Add-Ons/Client_MCP/client.cs");
}

function mcp_shutdown()
{
	if (isObject(McpTCP))
	{
		McpTCP.disconnect();
		McpTCP.delete();
	}
}

function mcp_init()
{
	if ($Server::Dedicated)
	{
		echo("Client_MCP: skipped on dedicated server");
		return;
	}

	createPath("config/mcp");
	mcp_loadOrCreateToken();
	mcp_shutdown();

	new TCPObject(McpTCP);
	McpTCP.listen($Mcp::Port);
	echo("Client_MCP: listening on TCP port" SPC $Mcp::Port);
	echo("Client_MCP: token file" SPC $Mcp::TokenFile);
}

function McpTCP::onConnectRequest(%this, %ip, %socket)
{
	if (!mcp_isLoopbackIp(%ip))
	{
		echo("Client_MCP: rejected non-loopback connect from" SPC %ip);
		%tmp = new TCPObject(McpReject, %socket);
		%tmp.delete();
		return;
	}

	echo("Client_MCP: connection from" SPC %ip);
	%conn = new TCPObject(McpClient, %socket);
	%conn.parent = %this;
	%conn.ip = %ip;
	%conn.authed = 0;
	mcp_send(%conn, "HELLO Client_MCP");
}

function McpClient::onLine(%this, %line)
{
	%line = trim(%line);
	if (%line $= "")
		return;

	%mode = getWord(%line, 0);

	if (!%this.authed)
	{
		if (%mode $= "AUTH")
		{
			%token = getWords(%line, 1, getWordCount(%line) - 1);
			if (%token $= $Mcp::Token && %token !$= "")
			{
				%this.authed = 1;
				mcp_send(%this, "AUTH_OK");
				echo("Client_MCP: authed");
			}
			else
			{
				mcp_send(%this, "AUTH_FAIL");
				echo("Client_MCP: auth failed");
				%this.delete();
			}
		}
		else
		{
			mcp_send(%this, "AUTH_REQUIRED");
			%this.delete();
		}
		return;
	}

	if (%mode $= "REQ")
	{
		%this.reqId = getWord(%line, 1);
		%this.reqCmd = getWord(%line, 2);
		%this.reqPayload = mcp_unescape(getWords(%line, 3, getWordCount(%line) - 1));
		// Defer to next tick so TCP callback stays light
		schedule(0, 0, mcp_dispatchConn, %this);
		return;
	}

	if (%mode $= "PING")
	{
		mcp_send(%this, "PONG");
		return;
	}

	if (%mode $= "DISCONNECT")
	{
		%this.delete();
		return;
	}

	mcp_replyErr(%this, "-", "unknown command: " @ %mode);
}

function McpClient::onDisconnect(%this)
{
	echo("Client_MCP: client disconnected" SPC %this.ip);
}

function mcp_dispatchConn(%conn)
{
	if (!isObject(%conn))
		return;

	%id = %conn.reqId;
	%cmd = %conn.reqCmd;
	%payload = %conn.reqPayload;

	switch$ (%cmd)
	{
		case "eval":
			mcp_cmd_eval(%conn, %id, %payload);
		case "state":
			mcp_cmd_state(%conn, %id);
		case "control":
			mcp_cmd_control(%conn, %id, %payload);
		case "screenshot":
			mcp_cmd_screenshot(%conn, %id);
		default:
			mcp_replyErr(%conn, %id, "unknown cmd: " @ %cmd);
	}
}

// Boot after client scripts settle
schedule(1000, 0, mcp_init);
