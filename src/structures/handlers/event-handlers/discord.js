import { logger } from '#utils/logger';

export default class DiscordHandler {
	constructor(client) {
		this.client = client;
		this.registeredEvents = new Map();
	}

	async register(event) {
		try {
			// Discord event names are unique listener keys. The repository currently
			// contains duplicate messageCreate modules; registering all of them
			// causes the last handler to overwrite this map entry while every
			// listener remains attached. Keep the first registration only.
			if (this.registeredEvents.has(event.name)) {
				logger.warn(
					'DiscordEvent',
					`Skipped duplicate Discord event registration: ${event.name}`,
				);
				return false;
			}
			const listener = (...args) => {
				// Event execute methods are async. Await their promise so failures
				// are caught here instead of becoming silent unhandled rejections.
				Promise.resolve()
					.then(() => event.execute(...args, this.client))
					.catch(error => {
						logger.error(
							'DiscordEvent',
							`Error in Discord event ${event.name}:`,
							error,
						);
					});
			};

			if (event.once) {
				this.client.once(event.name, listener);
			} else {
				this.client.on(event.name, listener);
			}

			this.registeredEvents.set(event.name, listener);
			return true;
		} catch (error) {
			logger.error(
				'DiscordEvent',
				`Failed to register Discord event: ${event.name}`,
				error,
			);
			return false;
		}
	}

	async unregister(eventName) {
		if (this.registeredEvents.has(eventName)) {
			this.client.removeListener(
				eventName,
				this.registeredEvents.get(eventName),
			);
			this.registeredEvents.delete(eventName);
		}
	}

	async unregisterAll() {
		for (const [eventName, listener] of this.registeredEvents) {
			this.client.removeListener(eventName, listener);
		}
		this.registeredEvents.clear();
	}
}
