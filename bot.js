const { Client, GatewayIntentBits, Routes } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { startSeedloaf } = require("./puppeteerStart");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const EMAIL = process.env.SEEDLOAF_EMAIL;
const PASS = process.env.SEEDLOAF_PASS;
const DASHBOARD = process.env.SEEDLOAF_DASHURL;

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

const commands = [
  {
    name: "startserver",
    description: "Starts the Minecraft server"
  }
];

async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log("Slash commands registered successfully");
  } catch (err) {
    console.error("Error registering commands:", err);
  }
}

client.once("ready", async () => {
  console.log(`Bot online as ${client.user.tag}`);
  await registerCommands();
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "startserver") {

    await interaction.reply("⚡ Starting your Seedloaf server...");

    if (!EMAIL || !PASS || !DASHBOARD) {
      await interaction.followUp(
        "⚠️ Missing Seedloaf credentials in Railway environment variables."
      );
      return;
    }

    try {

      await startSeedloaf({
        email: EMAIL,
        password: PASS,
        dashboardUrl: DASHBOARD
      });

      await interaction.followUp(
        "✅ Server start triggered successfully. Give it about a minute."
      );

    } catch (err) {

      console.error("Seedloaf start error:", err);

      await interaction.followUp(
        "⚠️ Failed to start the server. Check Railway logs."
      );
    }
  }
});

client.login(TOKEN);
