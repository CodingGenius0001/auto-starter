// bot.js
const { Client, GatewayIntentBits, Routes } = require("discord.js");
const { REST } = require("@discordjs/rest");

const {
  getServerState,
  startServerIfNeeded,
} = require("./ptero");

const {
  rconCommand,
  canUseRcon,
} = require("./mc");

const { renewServer } = require("./renew");

// ===== Env =====
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!TOKEN) {
  console.error("Missing DISCORD_TOKEN");
  process.exit(1);
}

if (!CLIENT_ID) {
  console.error("Missing CLIENT_ID");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ===== Slash Commands =====
const commands = [
  { name: "startserver", description: "Start the Minecraft server if stopped" },
  { name: "serverstatus", description: "Check if server is running/offline" },
  { name: "listplayers", description: "List online players (requires RCON)" },
  { name: "tps", description: "Check TPS (requires RCON)" },
  { name: "renewserver", description: "Manually renew server lease" },
];

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered");
  } catch (err) {
    console.error("Command registration failed:", err);
  }
}

// ===== AUTO RENEW EVERY 4 HOURS =====
fun
