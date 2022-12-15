import { Client, Collection, GatewayIntentBits, Message } from 'discord.js';
import { AvailableSettings } from './enums/available-settings';
import { Output } from './services/output';
import { readdirSync } from "fs";
import { join } from "path";
import { SlashCommand } from './types/slash-command';

const client = new Client({intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]})

client.slashCommands = new Collection<string, SlashCommand>()

const handlersDir = join(__dirname, "./handlers")
readdirSync(handlersDir).forEach(handler => {
    require(`${handlersDir}/${handler}`)(client)
})

client.login(AvailableSettings.TOKEN)

client.on('ready', () => {
    Output.line(`Logged in as ${client.user?.tag}`);
    client.user?.setActivity(`/kt <kenteken>`);
});