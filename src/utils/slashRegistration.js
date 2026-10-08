import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { logger } from '#utils/logger';
import { config } from '#config/config';

/**
 * Registers slash commands with Discord API
 * @param {AeroX} client - The Discord client instance
 */
export async function registerSlashCommands(client) {
    try {
        const slashCommandsData = client.commandHandler.getSlashCommandsData();

        if (!slashCommandsData || slashCommandsData.length === 0) {
            logger.info('SlashRegistration', 'No slash commands found to register.');
            return;
        }

        logger.info('SlashRegistration', `Registering ${slashCommandsData.length} slash commands...`);

        const rest = new REST({ version: '10' }).setToken(config.token);

        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: registeredSlashCommands },
        );

        logger.success('SlashRegistration', `Successfully registered ${registeredSlashCommands.length} slash commands globally.`);
    } catch (error) {
        logger.error('SlashRegistration', 'Failed to register slash commands:', error);
    }
}
