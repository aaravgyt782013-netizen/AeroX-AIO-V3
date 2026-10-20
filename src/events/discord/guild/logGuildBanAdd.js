import { AuditLogEvent } from "discord.js";
import { LoggingManager } from "#managers/LoggingManager";
export default { name:"guildBanAdd", async execute(ban) {
 const executor=await LoggingManager.executor(ban.guild,AuditLogEvent.MemberBanAdd,ban.user.id);
 await LoggingManager.send(ban.guild,"moderation",{title:"Member Banned",emoji:"🔨",color:0xED4245,description:"<@"+ban.user.id+"> was banned.",fields:[{name:"User",value:ban.user.tag || ban.user.id,inline:true},{name:"Executor",value:executor ? "<@"+executor.id+">" : "Unknown",inline:true},{name:"Reason",value:String(ban.reason || "No reason supplied").slice(0,1000)}]});
}};