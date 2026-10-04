// Command handlers for Client_MCP

deactivatePackage(McpEchoCapture);
package McpEchoCapture
{
	function echo(%a0, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9)
	{
		if ($Mcp::CapturingEcho)
		{
			%line = %a0;
			if (%a1 !$= "") %line = %line @ " " @ %a1;
			if (%a2 !$= "") %line = %line @ " " @ %a2;
			if (%a3 !$= "") %line = %line @ " " @ %a3;
			if (%a4 !$= "") %line = %line @ " " @ %a4;
			if (%a5 !$= "") %line = %line @ " " @ %a5;
			if (%a6 !$= "") %line = %line @ " " @ %a6;
			if (%a7 !$= "") %line = %line @ " " @ %a7;
			if (%a8 !$= "") %line = %line @ " " @ %a8;
			if (%a9 !$= "") %line = %line @ " " @ %a9;
			$Mcp::EchoBuffer = $Mcp::EchoBuffer @ %line @ "\n";
		}
		Parent::echo(%a0, %a1, %a2, %a3, %a4, %a5, %a6, %a7, %a8, %a9);
	}
};
activatePackage(McpEchoCapture);

function mcp_cmd_eval(%conn, %id, %code)
{
	$Mcp::EchoBuffer = "";
	$Mcp::Result = "";
	$Mcp::CapturingEcho = 1;
	$Mcp::EvalErr = 1;
	eval(%code @ " $Mcp::EvalErr = 0;");
	$Mcp::CapturingEcho = 0;

	%out = $Mcp::EchoBuffer;
	if ($Mcp::Result !$= "")
	{
		if (%out !$= "")
			%out = %out @ $Mcp::Result;
		else
			%out = $Mcp::Result;
	}
	if ($Mcp::EvalErr)
	{
		mcp_replyErr(%conn, %id, "eval failed\n" @ %out);
		return;
	}
	if (%out $= "")
		%out = "ok";
	mcp_replyOk(%conn, %id, %out);
}

// Prefer this over echo() — echo packaging is unreliable in Blockland.
function mcp_print(%text)
{
	$Mcp::EchoBuffer = $Mcp::EchoBuffer @ %text @ "\n";
}

function mcp_cmd_state(%conn, %id)
{
	%payload = "";
	%payload = %payload @ "connected=" @ (isObject(ServerConnection) ? "1" : "0") @ "\n";
	%payload = %payload @ "netName=" @ $pref::Player::NetName @ "\n";
	%payload = %payload @ "blid=" @ getNumKeyID() @ "\n";

	if (!isObject(ServerConnection))
	{
		mcp_replyOk(%conn, %id, %payload);
		return;
	}

	%ctrl = ServerConnection.getControlObject();
	if (!isObject(%ctrl))
	{
		%payload = %payload @ "controlObject=\n";
		mcp_replyOk(%conn, %id, %payload);
		return;
	}

	%tf = %ctrl.getTransform();
	%pos = getWords(%tf, 0, 2);
	%payload = %payload @ "controlObject=" @ %ctrl @ "\n";
	%payload = %payload @ "class=" @ %ctrl.getClassName() @ "\n";
	%payload = %payload @ "position=" @ %pos @ "\n";
	%payload = %payload @ "transform=" @ %tf @ "\n";

	if (%ctrl.getClassName() $= "Player" || %ctrl.getClassName() $= "AIPlayer")
	{
		%payload = %payload @ "eyePoint=" @ %ctrl.getEyePoint() @ "\n";
		%payload = %payload @ "eyeVector=" @ %ctrl.getEyeVector() @ "\n";
		%payload = %payload @ "velocity=" @ %ctrl.getVelocity() @ "\n";
		%payload = %payload @ "datablock=" @ %ctrl.getDataBlock().getName() @ "\n";
		if (%ctrl.getMountedImage(0))
			%payload = %payload @ "tool=" @ %ctrl.getMountedImage(0).getName() @ "\n";
		else
			%payload = %payload @ "tool=\n";
	}

	mcp_replyOk(%conn, %id, %payload);
}

function mcp_lookAt(%aim)
{
	if (!isObject(%pl = ServerConnection.getControlObject()))
		return 0;

	%pos = %pl.getEyePoint();
	%eye = %pl.getMuzzleVector(0);
	%x = getWord(%eye, 0);
	%y = getWord(%eye, 1);
	%vv = vectorNormalize(vectorSub(%aim, %pos));
	%xx = getWord(%vv, 0);
	%yy = getWord(%vv, 1);
	%myYaw = mAtan(%x, %y);
	%vvYaw = mAtan(%xx, %yy);
	%sub = %vvYaw - %myYaw;
	%sub += (%sub > 3.14159) ? -6.28319 : 0;
	%sub += (%sub < -3.14159) ? 6.28319 : 0;
	$mvYaw = %sub;
	$mvPitch = mATan(getWord(%eye, 2), mSqrt(%x * %x + %y * %y)) - mATan(getWord(%vv, 2), mSqrt(%xx * %xx + %yy * %yy));
	return 1;
}

function mcp_stopMovement()
{
	moveForward(0);
	moveBackward(0);
	moveLeft(0);
	moveRight(0);
	jump(0);
	crouch(0);
}

function mcp_cmd_control(%conn, %id, %payload)
{
	// payload: action [value...]
	%action = getWord(%payload, 0);
	%value = getWords(%payload, 1, getWordCount(%payload) - 1);

	if (%action $= "")
	{
		mcp_replyErr(%conn, %id, "missing action");
		return;
	}

	switch$ (%action)
	{
		case "stop":
			mcp_stopMovement();
			mouseFire(0);
			mcp_replyOk(%conn, %id, "stopped");

		case "forward":
			moveBackward(0);
			moveForward(%value $= "" ? 1 : %value);
			mcp_replyOk(%conn, %id, "forward " @ (%value $= "" ? 1 : %value));

		case "backward":
			moveForward(0);
			moveBackward(%value $= "" ? 1 : %value);
			mcp_replyOk(%conn, %id, "backward " @ (%value $= "" ? 1 : %value));

		case "left":
			moveRight(0);
			moveLeft(%value $= "" ? 1 : %value);
			mcp_replyOk(%conn, %id, "left " @ (%value $= "" ? 1 : %value));

		case "right":
			moveLeft(0);
			moveRight(%value $= "" ? 1 : %value);
			mcp_replyOk(%conn, %id, "right " @ (%value $= "" ? 1 : %value));

		case "jump":
			%on = (%value $= "" || %value $= "1") ? 1 : 0;
			jump(%on);
			if (%on)
				schedule(64, 0, jump, 0);
			mcp_replyOk(%conn, %id, "jump " @ %on);

		case "crouch":
			%on = (%value $= "" || %value $= "1") ? 1 : 0;
			crouch(%on);
			mcp_replyOk(%conn, %id, "crouch " @ %on);

		case "click":
			mouseFire(1);
			schedule(32, 0, mouseFire, 0);
			mcp_replyOk(%conn, %id, "click");

		case "fire":
			%on = (%value $= "" || %value $= "1") ? 1 : 0;
			mouseFire(%on);
			mcp_replyOk(%conn, %id, "fire " @ %on);

		case "yaw":
			$mvYaw = %value;
			mcp_replyOk(%conn, %id, "yaw " @ %value);

		case "pitch":
			$mvPitch = %value;
			mcp_replyOk(%conn, %id, "pitch " @ %value);

		case "lookAt":
			if (getWordCount(%value) < 3)
			{
				mcp_replyErr(%conn, %id, "lookAt needs x y z");
				return;
			}
			%ok = mcp_lookAt(%value);
			if (!%ok)
			{
				mcp_replyErr(%conn, %id, "no control object");
				return;
			}
			mcp_replyOk(%conn, %id, "lookAt " @ %value);

		case "pulseForward":
			%ms = %value $= "" ? 200 : %value;
			moveBackward(0);
			moveForward(1);
			schedule(%ms, 0, moveForward, 0);
			mcp_replyOk(%conn, %id, "pulseForward " @ %ms);

		default:
			mcp_replyErr(%conn, %id, "unknown action: " @ %action);
	}
}

function mcp_listScreenshots()
{
	%list = "";
	for (%file = findFirstFile("screenshots/*"); %file !$= ""; %file = findNextFile("screenshots/*"))
		%list = %list @ %file @ "\t";
	return %list;
}

function mcp_findNewScreenshot(%before)
{
	for (%file = findFirstFile("screenshots/*"); %file !$= ""; %file = findNextFile("screenshots/*"))
	{
		if (strPos(%before, %file @ "\t") < 0)
			return %file;
	}
	return "";
}

function mcp_cmd_screenshot(%conn, %id)
{
	%before = mcp_listScreenshots();
	doScreenShot();
	// engine writes async; poll briefly then reply (sidecar can also wait on FS)
	$Mcp::ShotConn = %conn;
	$Mcp::ShotId = %id;
	$Mcp::ShotBefore = %before;
	$Mcp::ShotTries = 0;
	schedule(50, 0, mcp_screenshotPoll);
}

function mcp_screenshotPoll()
{
	%conn = $Mcp::ShotConn;
	%id = $Mcp::ShotId;
	%before = $Mcp::ShotBefore;
	$Mcp::ShotTries++;

	%newest = mcp_findNewScreenshot(%before);
	if (%newest !$= "")
	{
		mcp_replyOk(%conn, %id, %newest);
		return;
	}

	if ($Mcp::ShotTries < 40)
	{
		schedule(50, 0, mcp_screenshotPoll);
		return;
	}

	mcp_replyOk(%conn, %id, "screenshots/");
}
