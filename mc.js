// mc.js
const { Rcon } = require("rcon-client");

function canUseRcon() {
  return Boolean(
    process.env.RCON_HOST &&
    process.env.RCON_PORT &&
    process.env.RCON_PASSWORD
  );
}

async function rconCommand(command) {
  const host = process.env.RCON_HOST;
  const port = Number(process.env.RCON_PORT || 25575);
  const password = process.env.RCON_PASSWORD;

  if (!host || !password) {
    throw new Error("Missing RCON env vars (RCON_HOST / RCON_PORT / RCON_PASSWORD)");
  }

  const rcon = await Rcon.connect({
    host,
    port,
    password,
    timeout: 10000,
  });

  try {
    const res = await rcon.send(command);
    return res || "(no output)";
  } finally {
    try { await rcon.end(); } catch {}
  }
}

module.exports = { rconCommand, canUseRcon };
