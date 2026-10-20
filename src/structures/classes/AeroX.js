import { REST } from '@discordjs/rest';
import { ClusterClient, getInfo } from 'discord-hybrid-sharding';
import {
        Client,
        GatewayIntentBits,
        Collection,
        Partials,
        Options,
} from 'discord.js';

import { config } from '#config/config';
import { db } from '#database/DatabaseManager';
import { CommandHandler } from '#handlers/CommandHandler';
import { EventLoader } from '#handlers/EventLoader';
import { logger } from '#utils/logger';
import { registerSlashCommands } from '#utils/slashRegistration';
import { MusicManager } from '#managers/MusicManager';

let shardInfo = null;
try {
        shardInfo = getInfo();
} catch (error) {
        shardInfo = null;
        // console.error(`Error while getting shard info: ${error}`);
}

export class LightCore extends Client {
        constructor() {
                const clientOptions = {
                        intents: [
                                GatewayIntentBits.Guilds,
                                GatewayIntentBits.GuildInvites,
                                GatewayIntentBits.GuildModeration,
                                GatewayIntentBits.GuildExpressions,
                                GatewayIntentBits.GuildWebhooks,
                                GatewayIntentBits.GuildMembers,
                                GatewayIntentBits.GuildMessages,
                                GatewayIntentBits.GuildVoiceStates,
                                GatewayIntentBits.GuildMessageReactions,
                                GatewayIntentBits.MessageContent,
                        ],
                        partials: [
                                Partials.Channel,
                                Partials.GuildMember,
                                Partials.Message,
                                Partials.User,
                        ],
                        makeCache: Options.cacheWithLimits({
                                MessageManager: 100,
                                PresenceManager: 0,
                                UserManager: 100,
                        }),
                        failIfNotExists: false,
                        allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
                };

                if (shardInfo) {
                        clientOptions.shards = shardInfo.SHARD_LIST;
                        clientOptions.shardCount = shardInfo.TOTAL_SHARDS;
                }

                super(clientOptions);

                this.cluster = shardInfo ? new ClusterClient(this) : null;
                this.commands = new Collection();
                this.logger = logger;
                this.config = config;
                this.db = db;
                this.music = new MusicManager(this);
                // Keep premium state accurate across restarts.
                try {
                        const cleaned = this.db.premium.cleanupExpired();
                        if (cleaned.total > 0) {
                                this.logger.info("LightCore", "Cleaned " + cleaned.total + " expired premium grant(s) at startup.");
                        }
                } catch (error) {
                        this.logger.error("LightCore", "Failed to clean expired premium grants:", error);
                }
                this.commandHandler = new CommandHandler(this);
                this.eventHandler = new EventLoader(this);

                // Premium users automatically inherit no-prefix command access.
                // Explicit owner-granted no-prefix users remain stored in the Set,
                // while premium status is checked live so grants/revokes take effect
                // immediately without requiring a restart.
                const explicitNoPrefixUsers = new Set();
                this.noPrefixUsers = new Proxy(explicitNoPrefixUsers, {
                        get: (target, property, receiver) => {
                                if (property === 'has') {
                                        return userId =>
                                                target.has(userId) ||
                                                Boolean(this.db.premium?.isUserPremium?.(userId));
                                }
                                const value = Reflect.get(target, property, target);
                                return typeof value === 'function' ? value.bind(target) : value;
                        },
                });

                this.startTime = Date.now();
                this.rest = new REST({ version: '10' }).setToken(config.token);
        }

        async init() {
                this.logger.info('LightCore', `❄️ Initializing bot...`);
                try {
                        await this.eventHandler.loadAllEvents();
                        await this.commandHandler.loadCommands();
                        this.noPrefixUsers.clear();
                        try {
                            const allUsers = this.db.user.all("SELECT id FROM users WHERE no_prefix = 1");
                            if (allUsers && Array.isArray(allUsers)) {
                                allUsers.forEach(u => this.noPrefixUsers.add(u.id));
                                this.logger.info('LightCore', `Loaded ${this.noPrefixUsers.size} no-prefix users into memory.`);
                            }
                        } catch (error) {
                            this.logger.error('LightCore', 'Failed to load no-prefix users:', error);
                        }
                        // Log the actual gateway lifecycle so an online-looking deploy
                        // cannot hide a failed Discord connection.
                        this.once('ready', async () => {
                                this.logger.success('DiscordGateway', `Ready as ${this.user?.tag || this.user?.id}`);
                                try { await this.music.init(); } catch (error) { this.logger.error('Music', 'Music service initialization failed:', error); }
                        });
                        this.on('raw', data => this.music.sendRawData(data));
                        this.on('shardError', (error, shardId) => {
                                this.logger.error('DiscordGateway', `Shard ${shardId} error:`, error);
                        });
                        this.on('shardDisconnect', (event, shardId) => {
                                this.logger.warn('DiscordGateway', `Shard ${shardId} disconnected (code ${event?.code ?? 'unknown'}).`);
                        });

                        // Connect to Discord first. Slash-command REST registration can
                        // be rate-limited and must not delay the gateway login.
                        await this.login(config.token);
                        this.logger.info('DiscordGateway', 'Login started; waiting for Ready event.');

                        void registerSlashCommands(this).catch(error => {
                                this.logger.error('SlashRegistration', 'Unexpected registration failure:', error);
                        });

                        this.logger.success(
                                'LightCore',
                                `❄️ Bot has successfully initialized. 🌸`,
                        );
                        this.logger.info('LightCore', '❄️ Coded by Shinchan');
                } catch (error) {
                        this.logger.error(
                                'LightCore',
                                '❄️ Failed to initialize bot cluster:',
                                error,
                        );
                        throw error;
                }
        }

        async cleanup() {
                this.logger.warn('LightCore', `❄️ Starting cleanup for bot...`);
                try {
                        await this.db.closeAll();
                        this.destroy();
                        this.logger.success(
                                'LightCore',
                                '❄️ Cleanup completed successfully. 🌸',
                        );
                } catch (error) {
                        this.logger.error(
                                'LightCore',
                                '❄️ An error occurred during cleanup:',
                                error,
                        );
                }
        }

        get uptime() {
                return Date.now() - this.startTime;
        }
}

// Backward-compatible export for existing entrypoints/imports.
export const AeroX = LightCore;
