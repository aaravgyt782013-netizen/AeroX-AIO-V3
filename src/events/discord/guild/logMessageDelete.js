import { LoggingManager } from "#managers/LoggingManager";
export default { name:"messageDelete", async execute(message){
 if(!message.guild) return;
 await LoggingManager.send(message.guild,"message",{emoji:"🗑️",title:"Message Deleted",color:0xED4245,description:"A message was deleted.",fields:[
 {name:"Author",value:message.author?"<@"+message.author.id+"> ("+message.author.tag+")":"Unknown",inline:true},
 {name:"Channel",value:"<#"+message.channelId+">",inline:true},
 {name:"Content",value:(message.content||"[content unavailable]").slice(0,3500),inline:false},
 {name:"Message ID",value:message.id,inline:true}
 ]});
}};