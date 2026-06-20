export * from "./auth.js";
export * from "./github.js";
export * from "./relations.js";

import * as authTables from "./auth.js";
import * as githubTables from "./github.js";
import * as authRelations from "./relations.js";

export const schema = {
  ...authTables,
  ...githubTables,
  ...authRelations,
};
