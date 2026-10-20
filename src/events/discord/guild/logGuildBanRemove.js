import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";
export default { name:"guildBanRemove", async execute(ban) {
 const executor=await LoggingManager.executor(ban.guild,AuditLogEvent.MemberBanRemove,ban.user.id);
 await LoggingManager.send(ban.guild,"moderation",{title:"Member Unbanned",emoji:"♻️",color:0x57F287,description:"<@"+ban.user.id+"> was unbanned.",fields:[{name:"User",value:ban.user.tag || ban.user.id,inline:true},{name:"Executor",value:executor ? "<@"+executor.id+">" : "Unknown",inline:true}]});
}};