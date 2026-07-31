import { ICommand } from '../interfaces/command';
import { BaseCommand } from './base-command';
import {
    SlashCommandBuilder,
    InteractionContextType,
    ApplicationIntegrationType,
    User,
    MessageFlags,
} from 'discord.js';
import { VehicleStats } from '../queries/vehicle-stats';
import { StatsView } from '../util/stats-view';
import { StatsScope } from '../types/stats';

export class Stats extends BaseCommand implements ICommand {
    public register(builder: SlashCommandBuilder): SlashCommandBuilder {
        builder
            .setName('stats')
            .setContexts(
                InteractionContextType.Guild,
                InteractionContextType.BotDM,
                InteractionContextType.PrivateChannel
            )
            .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
            .setDescription('Bekijk jouw spot-statistieken')
            .addUserOption((option) =>
                option.setName('gebruiker').setDescription('Bekijk de statistieken van een andere gebruiker')
            )
            .addStringOption((option) =>
                option
                    .setName('bereik')
                    .setDescription('Globale stats of alleen spots in deze server (standaard: globaal)')
                    .addChoices({ name: 'Globaal', value: 'global' }, { name: 'Server', value: 'server' })
            );

        return builder;
    }

    public async handle(): Promise<void> {
        await this.interaction.deferReply();

        const scope = this.getScope();
        const guildId = this.interaction.guildId;

        if (scope === 'server' && !guildId) {
            await this.interaction.followUp('Serverstats kunnen alleen in een server worden bekeken.');
            return;
        }

        const target = this.getTargetUser();
        const profile = await VehicleStats.forUser(target.id, scope === 'server' ? guildId : null);
        const components = StatsView.build(profile, target.displayName, scope);

        await this.interaction.followUp({
            components,
            flags: MessageFlags.IsComponentsV2,
        });
    }

    private getTargetUser(): User {
        return this.interaction.options.getUser('gebruiker') ?? this.interaction.user;
    }

    private getScope(): StatsScope {
        return this.interaction.options.getString('bereik') === 'server' ? 'server' : 'global';
    }
}
