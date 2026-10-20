import { LoggingManager } from "#managers/LoggingManager";
export default { name:"threadCreate", async execute(thread, newlyCreated) {
 if (!thread.guild || newlyCreated === false) return;
 await LoggingManager.send(thread.guild,"thread",{title:"Thread Created",emoji:"🧵",description:"Thread <#"+thread.id+"> was created.",fields:[{name:"Thread",value:String(thread.name || "Unnamed"),inline:true},{name:"Parent",value:thread.parentId ? "<#"+thread.parentId+">" : "Unknown",inline:true},{name:"Private",value:String(thread.type === 12),inline:true}]});
}};