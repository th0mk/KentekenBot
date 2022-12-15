import { Client, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import { AvailableSettings } from '../enums/available-settings';
import { SlashCommand } from '../types/slash-command';

module.exports = (client: Client) => {
    const slashCommands: SlashCommandBuilder[] = [];

    const slashCommandsDir = join(__dirname, '../slashCommands');

    readdirSync(slashCommandsDir).forEach((file) => {
        if (!file.endsWith('.js')) return;
        const command: SlashCommand = require(`${slashCommandsDir}/${file}`).default;
        slashCommands.push(command.command);
        client.slashCommands?.set(command.command.name, command);
    });

    const rest = new REST({ version: '10' }).setToken(AvailableSettings.TOKEN);

    rest.put(Routes.applicationCommands(AvailableSettings.CLIENT_ID), {
        body: slashCommands.map((command) => command.toJSON()),
    })
    .then((data: any) => {
        console.log(`🔥 Successfully loaded ${data.length} slash command(s)`);
    })
    .catch((e: any) => {
        console.log(e);
    });
};
