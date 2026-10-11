import { logger } from "#utils/logger";
import defaultClient from "../../../index.js";

export default {
  name: "raw",
  once: false,
  async execute(data, client = defaultClient) {
    try {
      // MusicEngine owns the LavalinkManager. The old handler called
      // client.lavalink, which is not the manager created by MusicEngine.
      const manager = client?.music?.lavalink;
      if (!manager || typeof manager.sendRawData !== "function") {
        logger.warn("LavalinkClient", "Dropped a raw gateway packet because the Lavalink manager is not ready.");
        return;
      }
      manager.sendRawData(data);
    } catch (error) {
      logger.error("LavalinkClient", "Error in raw event handler:", error);
    }
  }
};
