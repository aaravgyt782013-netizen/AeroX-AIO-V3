import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";
export default { name: "emojiDelete", async execute(emoji) {
  const executor = await LoggingManager.executor(emoji.guild, AuditLogEvent.EmojiDelete, emoji.id);
  await LoggingManager.send(emoji.guild, "emoji", { title: "Emoji Deleted", emoji: "🗑️", color:0xED4245, description: "Emoji **" + (emoji.name || "unknown") + "** was deleted.", fields: [{name:"Emoji ID",value:emoji.id,inline:true},{name:"Executor",value:executor ? "<@"+executor.id+">" : "Unknown",inline:true}] });
}};