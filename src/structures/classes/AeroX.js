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
import { MusicManager } from '#managers/MusicManager';
import { logger } from '#utils/logger';
import { registerSlashCommands } from '#utils/slashRegistration';

let shardInfo = null;
try {
        shardInfo = getInfo();
} catch (error) {
        shardInfo = null;
        // console.error(`Error while getting shard info: ${error}`);
}

export class AeroX extends Client {
        constructor() {
                const clientOptions = {
                        intents: [
                                GatewayIntentBits.Guilds,
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
                // Keep premium state accurate across restarts.
                try {
                        const cleaned = this.db.premium.cleanupExpired();
                        if (cleaned.total > 0) {
                                this.logger.info("AeroX", "Cleaned " + cleaned.total + " expired premium grant(s) at startup.");
                        }
                } catch (error) {
                        this.logger.error("AeroX", "Failed to clean expired premium grants:", error);
                }
                this.music = new MusicManager(this);
                this.lavalink = this.music.lavalink;

                // Lavalink must receive Discord gateway voice-state packets.
                // Without forwarding raw packets, the player can be created but
                // Lavalink cannot complete/maintain the voice connection, so no
                // audio reaches the Discord voice channel.
                this.on("raw", data => {
                        try {
                                this.lavalink?.sendRawData(data);
                        } catch (error) {
                                this.logger.debug("AeroX", `Failed to forward Lavalink raw packet: ${error.message}`);
                        }
                });

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
                this.logger.info('AeroX', `❄️ Initializing bot...`);
                try {
                        await this.eventHandler.loadAllEvents();
                        await this.commandHandler.loadCommands();
                        this.noPrefixUsers.clear();
                        try {
                            const allUsers = this.db.user.all("SELECT id FROM users WHERE no_prefix = 1");
                            if (allUsers && Array.isArray(allUsers)) {
                                allUsers.forEach(u => this.noPrefixUsers.add(u.id));
                                this.logger.info('AeroX', `Loaded ${this.noPrefixUsers.size} no-prefix users into memory.`);
                            }
                        } catch (error) {
                            this.logger.error('AeroX', 'Failed to load no-prefix users:', error);
                        }
                        await registerSlashCommands(this);
                        await this.login(config.token);

                        this.logger.success(
                                'AeroX',
                                `❄️ Bot has successfully initialized. 🌸`,
                        );
                        this.logger.info('AeroX', '❄️ Coded by Shinchan');
                } catch (error) {
                        this.logger.error(
                                'AeroX',
                                '❄️ Failed to initialize bot cluster:',
                                error,
                        );
                        throw error;
                }
        }

        async cleanup() {
                this.logger.warn('AeroX', `❄️ Starting cleanup for bot...`);
                try {
                        await this.db.closeAll();
                        this.destroy();
                        this.logger.success(
                                'AeroX',
                                '❄️ Cleanup completed successfully. 🌸',
                        );
                } catch (error) {
                        this.logger.error(
                                'AeroX',
                                '❄️ An error occurred during cleanup:',
                                error,
                        );
                }
        }

        get uptime() {
                return Date.now() - this.startTime;
        }
}
