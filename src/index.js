import { AeroX } from '#structures/classes/AeroX';
import { logger } from '#utils/logger';

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createServer } from 'node:http';

const client = new AeroX();

// Render web-service health endpoint. The Discord bot is still the main process,
// but Render needs an HTTP listener on 0.0.0.0 to keep the web service healthy.
const healthPort = Number(process.env.PORT || 10000);
const healthServer = createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (url.pathname === '/health' || url.pathname === '/') {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
                res.end(JSON.stringify({ ok: true, service: 'LightCore', uptime: Math.floor(process.uptime()) }));
                return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
});
healthServer.listen(healthPort, '0.0.0.0', () => {
        logger.success('Health', `HTTP health server listening on 0.0.0.0:${healthPort}`);
});

const main = async () => {
        try {
                await client.init();
                logger.success('Main', 'Discord bot initialized successfully');
        } catch (error) {
                logger.error('Main', 'Failed to initialize Discord bot', error);
                process.exit(1);
        }
};

const shutdown = async signal => {
        logger.info('Shutdown', `Received ${signal}, shutting down gracefully...`);
        try {
                await client.cleanup();
                logger.success('Shutdown', 'Bot shut down successfully');
                process.exit(0);
        } catch (error) {
                logger.error('Shutdown', 'Error during shutdown', error);
                process.exit(1);
        }
};

process.on('unhandledRejection', (reason, promise) => {
        logger.error('Process', 'Unhandled Rejection', reason);
        console.error(promise);
});

process.on('uncaughtException', (error, origin) => {
        logger.error('Process', `Uncaught Exception: ${origin}`, error);
        
        const errorMessage = error?.message || String(error);
        const isLavalinkError = errorMessage.includes('WebSocket was closed before the connection was established') ||
                                errorMessage.includes('lavalink') ||
                                errorMessage.includes('LavalinkNode') ||
                                error?.stack?.includes('lavalink-client');
        
        if (isLavalinkError) {
                logger.warn('Process', 'Lavalink-related error caught, not shutting down. Music will auto-reconnect...');
                return;
        }
        
        shutdown('uncaughtException');
});

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main();

export default client;
