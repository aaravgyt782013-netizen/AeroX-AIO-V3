function valueOrUnknown(value) {
  return value === undefined || value === null || value === "" ? "Unknown" : String(value);
}

export function renderAutomationMessage(template, { member, guild, channel = null, inviter = null, message = "" } = {}) {
  const user = member?.user;
  const created = user?.createdTimestamp
    ? "<t:" + Math.floor(user.createdTimestamp / 1000) + ":R>"
    : "Unknown";

  const replacements = {
    "{user}": member?.toString() || (user ? "<@" + user.id + ">" : "Unknown"),
    "{mention}": member?.toString() || (user ? "<@" + user.id + ">" : "Unknown"),
    "{username}": valueOrUnknown(member?.displayName || user?.username),
    "{tag}": valueOrUnknown(user?.tag || user?.username),
    "{userid}": valueOrUnknown(user?.id),
    "{server}": valueOrUnknown(guild?.name),
    "{serverid}": valueOrUnknown(guild?.id),
    "{membercount}": valueOrUnknown(guild?.memberCount),
    "{channel}": channel ? channel.toString() : "Unknown",
    "{channelname}": valueOrUnknown(channel?.name),
    "{channelid}": valueOrUnknown(channel?.id),
    "{servericon}": guild?.iconURL({ extension: "png", size: 512 }) || "",
    "{useravatar}": user?.displayAvatarURL({ extension: "png", size: 512 }) || "",
    "{created}": created,
    "{inviter}": inviter?.toString?.() || "Unknown",
    "{message}": valueOrUnknown(message),
    "{newline}": "\n",
  };

  let output = String(template || "");
  for (const [placeholder, value] of Object.entries(replacements)) {
    output = output.split(placeholder).join(value);
  }
  return output.trim();
}

export function automationPlaceholderHelp() {
  return [
    "{user} / {mention} → mentions the member",
    "{username} → display name",
    "{tag} → username/tag",
    "{userid} → Discord user ID",
    "{server} → server name",
    "{serverid} → server ID",
    "{membercount} → current member count",
    "{channel} / {channelname} → channel",
    "{servericon} → server icon URL",
    "{useravatar} → member avatar URL",
    "{created} → account creation time",
    "{inviter} → inviter when available",
    "{message} → message text (autoresponders)",
    "{newline} → line break",
  ].join("\n");
}
