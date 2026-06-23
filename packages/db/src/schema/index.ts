export * from "./auth.js";
export * from "./source-control.js";
export * from "./teams.js";
export * from "./discord.js";
export * from "./relations.js";
export { discordChannelRepoMapping, discordInstallation } from "./discord.js";

import * as authTables from "./auth.js";
import * as sourceControlTables from "./source-control.js";
import * as teamsTables from "./teams.js";
import * as discordTables from "./discord.js";
import * as authRelations from "./relations.js";

export const schema = {
  ...authTables,
  ...sourceControlTables,
  ...teamsTables,
  ...discordTables,
  ...authRelations,
};
