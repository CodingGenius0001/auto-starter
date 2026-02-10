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
  console.error("Missing DISCORD_TOKEN environment variable");
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error("Missing CLIENT_ID environment variable");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ===== Slash Commands =====
const commands = [
  { name: "startserver", description: "Start the Minecraft server (if it is not running)" },
  { name: "serverstatus", description: "Check if the server is running/offline" },
  { name: "listplayers", description: "List online players (requires RCON enabled)" },
  { name: "tps", description: "Check TPS (requires RCON enabled; works best on Paper/Spigot)" },
  { name: "renewserver", description: "Click the Renew button on your host panel (Puppeteer; may be blocked)" },
];

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Slash commands registered successfully");
  } catch (err) {
    console.error("Error registering commands:", err);
  }
}

client.once("ready", async () => {
  console.log(`Bot online as ${client.user.tag}`);
  await registerCommands();
});

// ===== Handlers =====
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "serverstatus") {
      await interaction.reply("Checking server status...");
      const state = await getServerState();
      await interaction.followUp(`Server state: **${state}**`);
      return;
    }

    if (interaction.commandName === "startserver") {
      await interaction.reply("⚡ Checking server state...");
      const result = await startServerIfNeeded();
      await interaction.followUp(result);
      return;
    }

    if (interaction.commandName === "listplayers") {
      if (!canUseRcon()) {
        await interaction.reply(
          "⚠️ RCON is not configured. Add `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD` in Railway, and enable RCON on your Minecraft server."
        );
        return;
      }
      await interaction.reply("Querying players via RCON...");
      const out = await rconCommand("list");
      await interaction.followUp(`\`\`\`\n${out}\n\`\`\``);
      return;
    }

    if (interaction.commandName === "tps") {
      if (!canUseRcon()) {
        await interaction.reply(
          "⚠️ RCON is not configured. Add `RCON_HOST`, `RCON_PORT`, `RCON_PASSWORD` in Railway, and enable RCON on your Minecraft server."
        );
        return;
      }
      await interaction.reply("Querying TPS via RCON...");
      // Works on Paper/Spigot. Vanilla may not support this.
      const out = await rconCommand("tps");
      await interaction.followUp(`\`\`\`\n${out}\n\`\`\``);
      return;
    }

    if (interaction.commandName === "renewserver") {
      await interaction.reply("Attempting renew (this may fail if the site blocks bots)...");
      const msg = await renewServer();
      await interaction.followUp(`✅ ${msg}`);
      return;
    }
  } catch (err) {
    console.error("Command error:", err);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp("⚠️ Command failed. Check Railway logs.");
      } else {
        await interaction.reply("⚠️ Command failed. Check Railway logs.");
      }
    } catch {}
  }
});

client.login(TOKEN);
