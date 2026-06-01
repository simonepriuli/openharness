import { execSync } from "node:child_process";

export function resolvePiBin(): string {
  if (process.env.PI_BIN) {
    return process.env.PI_BIN;
  }
  try {
    return execSync("which pi", { encoding: "utf8" }).trim();
  } catch {
    return "pi";
  }
}
