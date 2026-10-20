import { LoggingManager } from "#managers/LoggingManager";
export default { name:"threadDelete", async execute(thread) {
 if (!thread.guild) return;
 await LoggingManager.send(thread.guild,"thread",{title:"Thread Deleted",emoji:"🗑️",color:0xED4245,description:"A thread was deleted.",fields:[{name:"Thread",value:String(thread.name || "Unknown"),inline:true},{name:"Thread ID",value:thread.id,inline:true},{name:"Parent",value:thread.parentId ? "<#"+thread.parentId+">" : "Unknown",inline:true}]});
}};