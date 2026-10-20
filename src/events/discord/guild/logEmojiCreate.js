import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";
export default { name: "emojiCreate", async execute(emoji) {
  const executor = await LoggingManager.executor(emoji.guild, AuditLogEvent.EmojiCreate, emoji.id);
  await LoggingManager.send(emoji.guild, "emoji", { title: "Emoji Created", emoji: "😀", description: "Emoji **" + emoji.name + "** was created.", fields: [{name:"Emoji",value:emoji.toString(),inline:true},{name:"Executor",value:executor ? "<@"+executor.id+">" : "Unknown",inline:true}] });
}};