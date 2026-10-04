// Client_MCP configuration
if ($Mcp::Port $= "")
	$Mcp::Port = 9878;

if ($Mcp::TokenFile $= "")
	$Mcp::TokenFile = "config/mcp/token";

if ($Mcp::Token $= "")
	$Mcp::Token = "";

function mcp_randomHex(%bytes)
{
	%out = "";
	for (%i = 0; %i < %bytes; %i++)
	{
		%n = getRandom(0, 255);
		%h = "0123456789abcdef";
		%out = %out @ getSubStr(%h, (%n >> 4) & 15, 1) @ getSubStr(%h, %n & 15, 1);
	}
	return %out;
}

function mcp_loadOrCreateToken()
{
	createPath("config/mcp");
	%path = $Mcp::TokenFile;
	%file = new FileObject();
	if (%file.openForRead(%path))
	{
		%token = trim(%file.readLine());
		%file.close();
		%file.delete();
		if (%token !$= "")
		{
			$Mcp::Token = %token;
			return %token;
		}
	}

	%token = mcp_randomHex(16);
	if (%file.openForWrite(%path))
	{
		%file.writeLine(%token);
		%file.close();
	}
	%file.delete();
	$Mcp::Token = %token;
	echo("Client_MCP: wrote new token to" SPC %path);
	return %token;
}
