import { LoggingManager } from "#managers/LoggingManager";
export default { name:"messageUpdate", async execute(oldMessage,newMessage){
 if(!newMessage.guild || oldMessage.partial || newMessage.partial || oldMessage.content===newMessage.content) return;
 await LoggingManager.send(newMessage.guild,"message",{emoji:"✏️",title:"Message Edited",color:0xFEE75C,description:"A message was edited.",fields:[
 {name:"Author",value:newMessage.author?"<@"+newMessage.author.id+"> ("+newMessage.author.tag+")":"Unknown",inline:true},
 {name:"Channel",value:"<#"+newMessage.channelId+">",inline:true},
 {name:"Before",value:(oldMessage.content||"[empty]").slice(0,1000),inline:false},
 {name:"After",value:(newMessage.content||"[empty]").slice(0,1000),inline:false},
 {name:"Jump",value:newMessage.url,inline:false}
 ]});
}};