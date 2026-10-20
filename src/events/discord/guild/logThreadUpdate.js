import { LoggingManager } from "#managers/LoggingManager";
export default { name:"threadUpdate", async execute(oldThread,newThread) {
 if (!newThread.guild || oldThread.name === newThread.name && oldThread.archived === newThread.archived && oldThread.locked === newThread.locked) return;
 await LoggingManager.send(newThread.guild,"thread",{title:"Thread Updated",emoji:"✏️",description:"Thread settings changed for <#"+newThread.id+">.",fields:[{name:"Name",value:String(oldThread.name || "Unknown")+" → "+String(newThread.name || "Unknown")},{name:"Archived",value:String(oldThread.archived)+" → "+String(newThread.archived),inline:true},{name:"Locked",value:String(oldThread.locked)+" → "+String(newThread.locked),inline:true}]});
}};