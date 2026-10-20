import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";
export default { name: "emojiUpdate", async execute(oldEmoji, newEmoji) {
  const executor = await LoggingManager.executor(newEmoji.guild, AuditLogEvent.EmojiUpdate, newEmoji.id);
  await LoggingManager.send(newEmoji.guild, "emoji", { title: "Emoji Updated", emoji: "✏️", description: "Emoji configuration changed.", fields: [{name:"Before",value:String(oldEmoji.name || "unknown"),inline:true},{name:"After",value:String(newEmoji.name || "unknown"),inline:true},{name:"Executor",value:executor ? "<@"+executor.id+">" : "Unknown",inline:true}] });
}};