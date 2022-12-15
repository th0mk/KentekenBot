import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import moment from 'moment';
import { uptime } from 'os';
import { SlashCommand } from '../types/slash-command';

const command : SlashCommand = {
    command: new SlashCommandBuilder()
        .setName("status")
        .setDescription("Shows the bot's status"),
    execute: interaction => {
        interaction.reply({
            embeds: [ 
                new EmbedBuilder().addFields(
                    { name: 'Bot uptime', value: moment.duration(interaction.client.uptime).humanize() },
                    { name: 'Server uptime', value: moment.duration(uptime(), 'seconds').humanize() },
                    { name: 'Guild count', value: interaction.client.guilds.cache.size.toString() },
                    { name: 'Ping', value: `${interaction.client.ws.ping}` })
                ]
        })
    }
}

export default command