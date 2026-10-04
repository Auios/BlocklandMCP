// Line protocol helpers for Client_MCP
// Requests:  AUTH <token>
//            REQ <id> <cmd> <payload...>
// Responses: OK <id> <payload>
//            ERR <id> <message>
// Newlines in payload are escaped as \n, backslashes as \\

function mcp_escape(%text)
{
	%text = strReplace(%text, "\\", "\\\\");
	%text = strReplace(%text, "\n", "\\n");
	%text = strReplace(%text, "\r", "");
	return %text;
}

function mcp_unescape(%text)
{
	%out = "";
	%len = strLen(%text);
	for (%i = 0; %i < %len; %i++)
	{
		%c = getSubStr(%text, %i, 1);
		if (%c $= "\\" && %i + 1 < %len)
		{
			%n = getSubStr(%text, %i + 1, 1);
			if (%n $= "n")
			{
				%out = %out @ "\n";
				%i++;
				continue;
			}
			if (%n $= "\\")
			{
				%out = %out @ "\\";
				%i++;
				continue;
			}
		}
		%out = %out @ %c;
	}
	return %out;
}

function mcp_send(%conn, %line)
{
	if (!isObject(%conn))
		return;
	%conn.send(%line @ "\r\n");
}

function mcp_replyOk(%conn, %id, %payload)
{
	mcp_send(%conn, "OK" SPC %id SPC mcp_escape(%payload));
}

function mcp_replyErr(%conn, %id, %message)
{
	mcp_send(%conn, "ERR" SPC %id SPC mcp_escape(%message));
}

function mcp_isLoopbackIp(%ip)
{
	// Torque typically reports "IP:127.0.0.1:port" or similar
	if (%ip $= "")
		return false;
	if (strPos(%ip, "127.0.0.1") >= 0)
		return true;
	if (strPos(%ip, "localhost") >= 0)
		return true;
	if (strPos(%ip, "::1") >= 0)
		return true;
	return false;
}
