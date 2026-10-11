import { command, playQuery, getArgs, safeReply, sourceFromFlag } from "#utils/RythmCommands";

export default command({
  name: "play",
  description: "Play audio from supported sources",
  aliases: ["p"],
  voiceRequired: true,
  options: [
    { name: "query", description: "Song name or supported audio URL", type: 3, required: true },
    { name: "source", description: "Playback source", type: 3, required: false, choices: [
      { name: "YouTube Music", value: "ytmsearch" },
      { name: "YouTube", value: "ytsearch" },
      { name: "SoundCloud", value: "scsearch" }
    ] }
  ],
  execute: async x => {
    const args = getArgs(x);
    if (!args.length) return safeReply(x, "🎵 Play", "Usage: .play <song title or supported audio URL>", 0xED4245);
    let source = "";
    const i = args.findIndex(v => v === "--src" || v === "--source");
    if (i >= 0) { source = sourceFromFlag(args[i + 1]); args.splice(i, 2); }
    return playQuery(x, args.join(" "), { source });
  },
  slashExecute: async x => playQuery(x, x.interaction.options.getString("query"), { source: x.interaction.options.getString("source") || "ytmsearch" })
});
