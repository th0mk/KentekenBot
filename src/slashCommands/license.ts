import { VehicleInfo } from '../models/vehicle-info';
import { Str } from '../util/str';
import { License as LicenseUtil } from '../util/license';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } from 'discord.js';
import { Sightings } from '../services/sightings';
import { FuelInfo } from '../models/fuel-info';
import { DateTime } from '../util/date-time';
import { DiscordTimestamps } from '../enums/discord-timestamps';
import { SlashCommand } from '../types/slash-command';

const command: SlashCommand = {
    command: new SlashCommandBuilder()
        .setName('kt')
        .setDescription('Zoekt een kenteken op')
        .addStringOption(option => {
            return option
              .setName("kenteken")
              .setDescription("Het kenteken om op te zoeken")
              .setRequired(true);
          })
        .addStringOption(option => {
            return option
              .setName("comment")
              .setDescription("Voeg een comment toe aan je spot")
              .setRequired(true);
          }),
    execute: async (interaction) => {
        const options: { [key: string]: string | number | boolean } = {};
        if (!interaction.options) {
            interaction.reply({ content: "Something went wrong..." });
            return;
        }

        for (let i = 0; i < interaction.options.data.length; i++) {
          const element = interaction.options.data[i];
          if (element.name && element.value) options[element.name] = element.value;
        }

        const license = (options.kenteken as string).toUpperCase().split('-').join('');

        if (license == undefined || !LicenseUtil.isValid(license)) {
            interaction.reply({ content: 'Dat is geen kenteken kut', ephemeral: true });
            return;
        }

        const [vehicle, fuelInfo, sightings] = await Promise.all([
            VehicleInfo.get(license),
            FuelInfo.get(license),
            Sightings.list(license, interaction.guildId),
        ]);

        if (!vehicle) {
            interaction.reply({ content: 'Ik kon dat kenteken niet vindn kerol'});

            Sightings.insert(license, interaction.user, interaction.guild, (options.comment as string | null));
            return;
        }

        const fuelDescription: string[] = [];
        fuelInfo.engines.forEach((engine) => {
            fuelDescription.push(engine.getHorsePowerDescription());
        });

        const meta = [
            `🎨 ${Str.toTitleCase(vehicle.eerste_kleur)}`,
            vehicle.getPriceDescription(),
            `🗓️ ${DateTime.getDiscordTimestamp(vehicle.getConstructionDateTimestamp(), DiscordTimestamps.SHORT_DATE)}`,
        ];

        const description = fuelDescription.join('  -  ') + '\n' + meta.join('  -  ');

        const response = new EmbedBuilder()
            .setTitle(`${Str.toTitleCase(vehicle.merk)} ${Str.toTitleCase(vehicle.handelsbenaming)}`)
            .setDescription(description)
            .setThumbnail(`https://www.kentekencheck.nl/assets/img/brands/${Str.humanToSnakeCase(vehicle.merk)}.png`)
            .setFooter({ text: LicenseUtil.format(license) });

        if (sightings) {
            response.addFields([ { name: 'Eerder gespot door', value: sightings} ]);
        }

        const links = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setLabel('Kentekencheck')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://kentekencheck.nl/kenteken?i=${license}`),
            new ButtonBuilder()
                .setLabel('Finnik')
                .setStyle(ButtonStyle.Link)
                .setURL(`https://finnik.nl/kenteken/${license}/gratis`)
        );

        interaction.reply({ embeds: [response], components: [links]  });

        Sightings.insert(license, interaction.user, interaction.guild, (options.comment as string | null));
    }
}