import { ICommand } from '../interfaces/command';
import { BaseCommand } from './base-command';
import {
    ActionRowBuilder,
    ButtonBuilder,
    EmbedBuilder,
    ButtonStyle,
    SlashCommandBuilder,
    InteractionContextType,
    ApplicationIntegrationType,
    ComponentType,
    ButtonInteraction,
    Message,
    InteractionCollector,
    Collection,
} from 'discord.js';
import { Sighting } from '../models/sighting';
import { Vehicle } from '../models/vehicle';
import { Str } from '../util/str';
import { DateTime } from '../util/date-time';
import { DiscordTimestamps } from '../enums/discord-timestamps';
import { formatCurrency } from '../util/format-currency';
import { License as LicenseUtil } from '../util/license';

const SIGHTINGS_PER_PAGE = 5;

export class Sightings extends BaseCommand implements ICommand {
    public register(builder: SlashCommandBuilder): SlashCommandBuilder {
        builder
            .setName('sightings')
            .setContexts(
                InteractionContextType.Guild,
                InteractionContextType.BotDM,
                InteractionContextType.PrivateChannel
            )
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
            .setDescription('Bekijk al je eerdere spots');

        return builder;
    }

    public async handle(): Promise<void> {
        await this.interaction.deferReply();

        const userId = this.interaction.user.id;
        const guildId = this.interaction.guildId;

        // Get total count of sightings
        const totalCount = await Sighting.count({
            where: guildId ? { discordGuildId: guildId } : { discordUserId: userId },
        });

        if (totalCount === 0) {
            await this.interaction.followUp({
                content: 'Je hebt nog geen spots! Gebruik `/k <kenteken>` om je eerste voertuig te spotten.',
            });
            return;
        }

        // Send first page
        await this.sendPage(0, totalCount, userId, guildId);
    }

    private async sendPage(page: number, totalCount: number, userId: string, guildId: string | null): Promise<void> {
        const offset = page * SIGHTINGS_PER_PAGE;
        const totalPages = Math.ceil(totalCount / SIGHTINGS_PER_PAGE);

        // Fetch sightings with pagination
        const sightings = await Sighting.findAll({
            where: guildId ? { discordGuildId: guildId } : { discordUserId: userId },
            include: [
                {
                    model: Vehicle,
                    as: 'vehicle',
                    required: false,
                },
            ],
            order: [['createdAt', 'DESC']],
            limit: SIGHTINGS_PER_PAGE,
            offset: offset,
        });

        // Build embed with sighting details
        const embed = new EmbedBuilder()
            .setTitle(`🚗 Jouw Spots`)
            .setDescription(
                `${guildId ? 'Server' : 'Persoonlijke'} spots - Pagina ${
                    page + 1
                } van ${totalPages} (${totalCount} totaal)`
            )
            .setColor(0x5865f2)
            .setTimestamp();

        // Add each sighting as a field
        for (const sighting of sightings) {
            const vehicle = sighting.vehicle;
            const license = sighting.license || 'Onbekend';
            const formattedLicense = LicenseUtil.format(license);

            let fieldValue = '';

            if (vehicle) {
                // Display vehicle details
                const vehicleName = `${Str.toTitleCase(vehicle.brand || 'Onbekend')} ${Str.toTitleCase(
                    vehicle.tradeName || ''
                )}`.trim();
                const color = vehicle.color ? `🎨 ${Str.toTitleCase(vehicle.color)}` : '';
                const price = vehicle.price ? `💵 ${formatCurrency(vehicle.price)}` : '';
                const fuelType = vehicle.primaryFuelType ? `⛽ ${Str.toTitleCase(vehicle.primaryFuelType)}` : '';
                const horsepower = vehicle.totalHorsepower ? `🐎 ${vehicle.totalHorsepower} PK` : '';

                const details = [color, price, fuelType, horsepower].filter((d) => d).join(' • ');

                fieldValue = `**${vehicleName}**\n${details}\n`;
            } else {
                fieldValue = `**Kenteken:** ${formattedLicense}\n`;
            }

            // Add timestamp and comment
            const timestamp = DateTime.getDiscordTimestamp(
                new Date(sighting.createdAt).getTime(),
                DiscordTimestamps.RELATIVE
            );
            fieldValue += `⏰ ${timestamp}`;

            if (sighting.comment) {
                fieldValue += `\n💬 *${sighting.comment}*`;
            }

            embed.addFields([
                {
                    name: `${formattedLicense}`,
                    value: fieldValue,
                    inline: false,
                },
            ]);
        }

        // Create navigation buttons
        const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`sightings_first`)
                .setLabel('⏮️ Eerste')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`sightings_prev`)
                .setLabel('◀️ Vorige')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`sightings_next`)
                .setLabel('Volgende ▶️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(page >= totalPages - 1),
            new ButtonBuilder()
                .setCustomId(`sightings_last`)
                .setLabel('Laatste ⏭️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page >= totalPages - 1)
        );

        const message = await this.interaction.followUp({
            embeds: [embed],
            components: [buttons],
        });

        // Create collector for button interactions
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 300000, // 5 minutes
        });

        collector.on('collect', async (i: ButtonInteraction) => {
            // Only allow the original user to interact
            if (i.user.id !== userId) {
                await i.reply({
                    content: 'Deze knoppen zijn niet voor jou!',
                    ephemeral: true,
                });
                return;
            }

            let newPage = page;

            switch (i.customId) {
                case 'sightings_first':
                    newPage = 0;
                    break;
                case 'sightings_prev':
                    newPage = Math.max(0, page - 1);
                    break;
                case 'sightings_next':
                    newPage = Math.min(totalPages - 1, page + 1);
                    break;
                case 'sightings_last':
                    newPage = totalPages - 1;
                    break;
            }

            // Update the page
            await i.deferUpdate();
            collector.stop();

            // Fetch and display new page
            const newOffset = newPage * SIGHTINGS_PER_PAGE;
            const newSightings = await Sighting.findAll({
                where: guildId ? { discordGuildId: guildId } : { discordUserId: userId },
                include: [
                    {
                        model: Vehicle,
                        as: 'vehicle',
                        required: false,
                    },
                ],
                order: [['createdAt', 'DESC']],
                limit: SIGHTINGS_PER_PAGE,
                offset: newOffset,
            });

            // Build new embed
            const newEmbed = new EmbedBuilder()
                .setTitle(`🚗 Jouw Spots`)
                .setDescription(
                    `${guildId ? 'Server' : 'Persoonlijke'} spots - Pagina ${
                        newPage + 1
                    } van ${totalPages} (${totalCount} totaal)`
                )
                .setColor(0x5865f2)
                .setTimestamp();

            for (const sighting of newSightings) {
                const vehicle = sighting.vehicle;
                const license = sighting.license || 'Onbekend';
                const formattedLicense = LicenseUtil.format(license);

                let fieldValue = '';

                if (vehicle) {
                    const vehicleName = `${Str.toTitleCase(vehicle.brand || 'Onbekend')} ${Str.toTitleCase(
                        vehicle.tradeName || ''
                    )}`.trim();
                    const color = vehicle.color ? `🎨 ${Str.toTitleCase(vehicle.color)}` : '';
                    const price = vehicle.price ? `💵 ${formatCurrency(vehicle.price)}` : '';
                    const fuelType = vehicle.primaryFuelType ? `⛽ ${Str.toTitleCase(vehicle.primaryFuelType)}` : '';
                    const horsepower = vehicle.totalHorsepower ? `🐎 ${vehicle.totalHorsepower} PK` : '';

                    const details = [color, price, fuelType, horsepower].filter((d) => d).join(' • ');

                    fieldValue = `**${vehicleName}**\n${details}\n`;
                } else {
                    fieldValue = `**Kenteken:** ${formattedLicense}\n`;
                }

                const timestamp = DateTime.getDiscordTimestamp(
                    new Date(sighting.createdAt).getTime(),
                    DiscordTimestamps.RELATIVE
                );
                fieldValue += `⏰ ${timestamp}`;

                if (sighting.comment) {
                    fieldValue += `\n💬 *${sighting.comment}*`;
                }

                newEmbed.addFields([
                    {
                        name: `${formattedLicense}`,
                        value: fieldValue,
                        inline: false,
                    },
                ]);
            }

            // Update navigation buttons
            const newButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`sightings_first`)
                    .setLabel('⏮️ Eerste')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(newPage === 0),
                new ButtonBuilder()
                    .setCustomId(`sightings_prev`)
                    .setLabel('◀️ Vorige')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(newPage === 0),
                new ButtonBuilder()
                    .setCustomId(`sightings_next`)
                    .setLabel('Volgende ▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(newPage >= totalPages - 1),
                new ButtonBuilder()
                    .setCustomId(`sightings_last`)
                    .setLabel('Laatste ⏭️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(newPage >= totalPages - 1)
            );

            await i.editReply({
                embeds: [newEmbed],
                components: [newButtons],
            });

            // Restart collector for new page
            const newMessage = await i.fetchReply();
            const newCollector = newMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            // Reuse the same collection logic
            this.handleCollector(newCollector, newPage, totalPages, totalCount, userId, guildId, newMessage);
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                // Disable buttons after timeout
                const disabledButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`sightings_first`)
                        .setLabel('⏮️ Eerste')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`sightings_prev`)
                        .setLabel('◀️ Vorige')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`sightings_next`)
                        .setLabel('Volgende ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`sightings_last`)
                        .setLabel('Laatste ⏭️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

                message.edit({ components: [disabledButtons] }).catch(() => {
                    // Ignore errors if message was already deleted
                });
            }
        });
    }

    private handleCollector(
        collector: InteractionCollector<ButtonInteraction>,
        page: number,
        totalPages: number,
        totalCount: number,
        userId: string,
        guildId: string | null,
        currentMessage: Message
    ): void {
        collector.on('collect', async (i: ButtonInteraction) => {
            if (i.user.id !== userId) {
                await i.reply({
                    content: 'Deze knoppen zijn niet voor jou!',
                    ephemeral: true,
                });
                return;
            }

            let newPage = page;

            switch (i.customId) {
                case 'sightings_first':
                    newPage = 0;
                    break;
                case 'sightings_prev':
                    newPage = Math.max(0, page - 1);
                    break;
                case 'sightings_next':
                    newPage = Math.min(totalPages - 1, page + 1);
                    break;
                case 'sightings_last':
                    newPage = totalPages - 1;
                    break;
            }

            await i.deferUpdate();
            collector.stop();

            const newOffset = newPage * SIGHTINGS_PER_PAGE;
            const newSightings = await Sighting.findAll({
                where: guildId ? { discordGuildId: guildId } : { discordUserId: userId },
                include: [
                    {
                        model: Vehicle,
                        as: 'vehicle',
                        required: false,
                    },
                ],
                order: [['createdAt', 'DESC']],
                limit: SIGHTINGS_PER_PAGE,
                offset: newOffset,
            });

            const newEmbed = new EmbedBuilder()
                .setTitle(`🚗 Jouw Spots`)
                .setDescription(
                    `${guildId ? 'Server' : 'Persoonlijke'} spots - Pagina ${
                        newPage + 1
                    } van ${totalPages} (${totalCount} totaal)`
                )
                .setColor(0x5865f2)
                .setTimestamp();

            for (const sighting of newSightings) {
                const vehicle = sighting.vehicle;
                const license = sighting.license || 'Onbekend';
                const formattedLicense = LicenseUtil.format(license);

                let fieldValue = '';

                if (vehicle) {
                    const vehicleName = `${Str.toTitleCase(vehicle.brand || 'Onbekend')} ${Str.toTitleCase(
                        vehicle.tradeName || ''
                    )}`.trim();
                    const color = vehicle.color ? `🎨 ${Str.toTitleCase(vehicle.color)}` : '';
                    const price = vehicle.price ? `💵 ${formatCurrency(vehicle.price)}` : '';
                    const fuelType = vehicle.primaryFuelType ? `⛽ ${Str.toTitleCase(vehicle.primaryFuelType)}` : '';
                    const horsepower = vehicle.totalHorsepower ? `🐎 ${vehicle.totalHorsepower} PK` : '';

                    const details = [color, price, fuelType, horsepower].filter((d) => d).join(' • ');

                    fieldValue = `**${vehicleName}**\n${details}\n`;
                } else {
                    fieldValue = `**Kenteken:** ${formattedLicense}\n`;
                }

                const timestamp = DateTime.getDiscordTimestamp(
                    new Date(sighting.createdAt).getTime(),
                    DiscordTimestamps.RELATIVE
                );
                fieldValue += `⏰ ${timestamp}`;

                if (sighting.comment) {
                    fieldValue += `\n💬 *${sighting.comment}*`;
                }

                newEmbed.addFields([
                    {
                        name: `${formattedLicense}`,
                        value: fieldValue,
                        inline: false,
                    },
                ]);
            }

            const newButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`sightings_first`)
                    .setLabel('⏮️ Eerste')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(newPage === 0),
                new ButtonBuilder()
                    .setCustomId(`sightings_prev`)
                    .setLabel('◀️ Vorige')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(newPage === 0),
                new ButtonBuilder()
                    .setCustomId(`sightings_next`)
                    .setLabel('Volgende ▶️')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(newPage >= totalPages - 1),
                new ButtonBuilder()
                    .setCustomId(`sightings_last`)
                    .setLabel('Laatste ⏭️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(newPage >= totalPages - 1)
            );

            await i.editReply({
                embeds: [newEmbed],
                components: [newButtons],
            });

            const newMessage = await i.fetchReply();
            const newCollector = newMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000,
            });

            this.handleCollector(newCollector, newPage, totalPages, totalCount, userId, guildId, newMessage);
        });

        collector.on('end', (_collected: Collection<string, ButtonInteraction>, reason: string) => {
            if (reason === 'time') {
                const disabledButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`sightings_first`)
                        .setLabel('⏮️ Eerste')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`sightings_prev`)
                        .setLabel('◀️ Vorige')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`sightings_next`)
                        .setLabel('Volgende ▶️')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId(`sightings_last`)
                        .setLabel('Laatste ⏭️')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

                currentMessage.edit({ components: [disabledButtons] }).catch(() => {
                    // Ignore errors if message was already deleted
                });
            }
        });
    }
}
