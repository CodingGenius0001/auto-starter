// bot.js
const { Client, GatewayIntentBits, Routes } = require("discord.js");
const { REST } = require("@discordjs/rest");

const { getServerState, startServerIfNeeded } = require("./ptero");
const { rconCommand, canUseRcon } = require("./mc");
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

// ===== Discord Client =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// ===== Slash Commands =====
const commands = [
  { name: "startserver", description: "Start the Minecraft server if stopped" },
  { name: "serverstatus", description: "Check if server is running/offline" },
  { name: "listplayers", description: "List online players (requires RCON)" },
  { name: "tps", description: "Check TPS (requires RCON)" },
  { name: "renewserver", description: "Renew server lease (manual)" },
  { name: "bothelp", description: "Show all bot commands and what they do" },
];

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });

    console.log("Slash commands registered");
  } catch (err) {
    console.error("Command registration failed:", err);
  }
}

// ===== Auto Renew =====
function startAutoRenewTask() {
  const FOUR_HOURS = 4 * 60 * 60 * 1000;

  async function runRenew(source = "AUTO") {
    console.log(`[${source}-RENEW] Running renew task...`);
    try {
      const result = await renewServer();
      console.log(`[${source}-RENEW] Success:`, result);
      return { ok: true, result };
    } catch (err) {
      console.error(`[${source}-RENEW] Failed:`, err);
      return { ok: false, error: err?.message || String(err) };
    }
  }

  // Run once at startup
  runRenew("AUTO");

  // Run every 4 hours
  setInterval(() => runRenew("AUTO"), FOUR_HOURS);

  // Expose for manual use (same implementation)
  return runRenew;
}

let runRenewShared = null;

// ===== Ready =====
client.once("ready", async () => {
  console.log(`Bot online as ${client.user.tag}`);
  await registerCommands();

  // Create shared renew runner (used by both auto + /renewserver)
  runRenewShared = startAutoRenewTask();
});

// ===== Help Text =====
function buildHelpText() {
  return [
    "**Available commands**",
    "",
    "• `/startserver` — Checks panel; starts server if it's stopped.",
    "• `/serverstatus` — Shows current server state from the panel.",
    "• `/listplayers` — Shows online players (needs RCON env vars).",
    "• `/tps` — Shows TPS (needs RCON env vars).",
    "• `/renewserver` — Clicks the renew button (manual).",
    "• `/bothelp` — Shows this help message.",
    "",
    "_Note: `/listplayers` and `/tps` require RCON enabled on your MC server and Railway env vars set._",
  ].join("\n");
}

// ===== Command Handling =====
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "bothelp") {
      await interaction.reply(buildHelpText());
      return;
    }

    if (interaction.commandName === "serverstatus") {
      await interaction.reply("Checking status...");
      const state = await getServerState();
      await interaction.followUp(`Server state: **${state}**`);
      return;
    }

    if (interaction.commandName === "startserver") {
      await interaction.reply("Checking server...");
      const result = await startServerIfNeeded();
      await interaction.followUp(result);
      return;
    }

    if (interaction.commandName === "listplayers") {
      if (!canUseRcon()) {
        await interaction.reply("RCON not configured. Set RCON_HOST, RCON_PORT, RCON_PASSWORD in Railway.");
        return;
      }
      await interaction.reply("Getting players...");
      const out = await rconCommand("list");
      await interaction.followUp(`\`\`\`\n${out}\n\`\`\``);
      return;
    }

    if (interaction.commandName === "tps") {
      if (!canUseRcon()) {
        await interaction.reply("RCON not configured. Set RCON_HOST, RCON_PORT, RCON_PASSWORD in Railway.");
        return;
      }
      await interaction.reply("Getting TPS...");
      const out = await rconCommand("tps");
      await interaction.followUp(`\`\`\`\n${out}\n\`\`\``);
      return;
    }

    if (interaction.commandName === "renewserver") {
      await interaction.reply("Renewing server...");

      // Use the shared runner (same code path as auto renew), fallback to direct call
      if (typeof runRenewShared === "function") {
        const res = await runRenewShared("MANUAL");
        if (res.ok) await interaction.followUp(`✅ ${res.result}`);
        else await interaction.followUp(`⚠️ Renew failed: ${res.error}`);
      } else {
        const result = await renewServer();
        await interaction.followUp(`✅ ${result}`);
      }

      return;
    }
  } catch (err) {
    console.error(err);
    if (interaction.replied) await interaction.followUp("Command failed. Check Railway logs.");
    else await interaction.reply("Command failed. Check Railway logs.");
  }
});

client.login(TOKEN);
