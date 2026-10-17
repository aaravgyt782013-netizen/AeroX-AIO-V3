import { LoggingManager } from "#managers/LoggingManager";

export default {
  name: "voiceStateUpdate",
  async execute(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;
    const before = oldState.channel;
    const after = newState.channel;
    if (before?.id === after?.id && oldState.serverMute === newState.serverMute && oldState.serverDeaf === newState.serverDeaf && oldState.selfMute === newState.selfMute && oldState.selfDeaf === newState.selfDeaf && oldState.streaming === newState.streaming && oldState.selfVideo === newState.selfVideo) return;

    let title = "Voice State Updated";
    let description = `<@${member.id}> voice state changed.`;
    if (!before && after) { title = "Joined Voice Channel"; description = `<@${member.id}> joined <#${after.id}>.`; }
    else if (before && !after) { title = "Left Voice Channel"; description = `<@${member.id}> left **${before.name}**.`; }
    else if (before && after && before.id !== after.id) { title = "Moved Voice Channel"; description = `<@${member.id}> moved from **${before.name}** to <#${after.id}>.`; }
    const fields = [{ name: "Member", value: `<@${member.id}>`, inline: true }];
    if (before) fields.push({ name: "Previous channel", value: `#${before.name}`, inline: true });
    if (after) fields.push({ name: "Current channel", value: `<#${after.id}>`, inline: true });
    const flags = [];
    if (oldState.serverMute !== newState.serverMute) flags.push(`Server muted: ${newState.serverMute}`);
    if (oldState.serverDeaf !== newState.serverDeaf) flags.push(`Server deafened: ${newState.serverDeaf}`);
    if (oldState.selfMute !== newState.selfMute) flags.push(`Self-muted: ${newState.selfMute}`);
    if (oldState.selfDeaf !== newState.selfDeaf) flags.push(`Self-deafened: ${newState.selfDeaf}`);
    if (oldState.streaming !== newState.streaming) flags.push(`Streaming: ${newState.streaming}`);
    if (oldState.selfVideo !== newState.selfVideo) flags.push(`Camera: ${newState.selfVideo}`);
    if (flags.length) fields.push({ name: "State changes", value: flags.join("\n") });
    await LoggingManager.send(guild, "voice", { emoji: "🔊", title, description, fields });
  }
};
