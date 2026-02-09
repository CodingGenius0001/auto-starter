const { Client, GatewayIntentBits, Routes } = require("discord.js");
const { REST } = require("@discordjs/rest");
const { startSeedloaf } = require("./puppeteerStart");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.DISCORD_TOKEN;
const EMAIL = process.env.SEEDLOAF_EMAIL;
const PASS = process.env.SEEDLOAF_PASS;
const DASHBOARD = process.env.SEEDLOAF_DASHURL;

client.once("ready", () => {
  console.log("Bot online!");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "startserver") {
    await interaction.reply("⚡ Starting your Seedloaf server...");
    try {
      await startSeedloaf({ email: EMAIL, password: PASS, dashboardUrl: DASHBOARD });
      await interaction.followUp("Server should be starting—give it a minute!");
    } catch (err) {
      console.error(err);
      await interaction.followUp("⚠️ Something went wrong trying to start the server.");
    }
  }
});

// Register slash commands
const commands = [
  { name: "startserver", description: "Starts the Minecraft server" }
];
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
  } catch (err) {
    console.error(err);
  }
})();

client.login(TOKEN);
