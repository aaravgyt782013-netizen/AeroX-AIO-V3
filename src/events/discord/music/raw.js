import { logger } from "#utils/logger";

// AeroX forwards Discord gateway voice packets directly to its LavalinkManager
// in the constructor. Forwarding them again here duplicates voice-state packets
// and can destabilize voice sessions, so this legacy event is intentionally inert.
export default {
  name: "raw",
  once: false,
  async execute() {
    logger.debug?.("LavalinkClient", "Legacy raw event ignored; gateway forwarding is owned by AeroX.");
  }
};
