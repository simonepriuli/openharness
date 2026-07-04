import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import * as actualChildProcess from "node:child_process";
import * as actualFs from "node:fs";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mockConfig } from "./helpers/fixtures.js";
import { importFresh } from "./helpers/import-fresh.js";

describe("pi runtime", () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
    mock.restoreAll();
  });

  it("uses PI_BIN when set", async () => {
    process.env.PI_BIN = "/custom/pi";
    const { resolveCloudPiBin } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    assert.equal(resolveCloudPiBin(mockConfig()), "/custom/pi");
  });

  it("uses vendored cli from OPENHARNESS_ROOT", async () => {
    delete process.env.PI_BIN;
    const root = join(tmpdir(), `pi-root-${process.pid}`);
    const cliPath = join(root, "pi/packages/coding-agent/dist/cli.js");
    mkdirSync(cliPath.replace("/cli.js", ""), { recursive: true });
    writeFileSync(cliPath, "// cli", "utf8");

    const { resolveCloudPiBin } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    const config = mockConfig({ openHarnessRoot: root });
    assert.equal(resolveCloudPiBin(config), cliPath);
    rmSync(root, { recursive: true, force: true });
  });

  it("falls back to global pi binary when which succeeds", async () => {
    delete process.env.PI_BIN;
    mock.module("node:fs", {
      cache: false,
      namedExports: {
        ...actualFs,
        existsSync: (path: string) => {
          if (String(path).includes("coding-agent/dist/cli.js")) return false;
          return actualFs.existsSync(path);
        },
      },
    });
    mock.module("node:child_process", {
      cache: false,
      namedExports: {
        ...actualChildProcess,
        execSync: () => "/usr/local/bin/pi\n",
      },
    });
    const { resolveCloudPiBin } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    assert.equal(resolveCloudPiBin(mockConfig()), "/usr/local/bin/pi");
  });

  it("falls back to pi command name when which fails", async () => {
    delete process.env.PI_BIN;
    mock.module("node:fs", {
      cache: false,
      namedExports: {
        ...actualFs,
        existsSync: (path: string) => {
          if (String(path).includes("coding-agent/dist/cli.js")) return false;
          return actualFs.existsSync(path);
        },
      },
    });
    mock.module("node:child_process", {
      cache: false,
      namedExports: {
        ...actualChildProcess,
        execSync: () => {
          throw new Error("missing");
        },
      },
    });
    const { resolveCloudPiBin } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    assert.equal(resolveCloudPiBin(mockConfig()), "pi");
  });

  it("spawns node for js binaries and raw command otherwise", async () => {
    process.env.PI_NODE = "/custom/node";
    process.env.PI_BIN = join(tmpdir(), "pi-cli.js");
    const { resolveCloudPiSpawn } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    const jsSpawn = resolveCloudPiSpawn(mockConfig(), ["--rpc"], {
      piAgentDir: "/agent",
      exaApiKey: "exa-key",
    });
    assert.equal(jsSpawn.command, "/custom/node");
    assert.equal(jsSpawn.env.EXA_API_KEY, "exa-key");

    delete process.env.PI_BIN;
    delete process.env.PI_NODE;
    const binSpawn = resolveCloudPiSpawn(mockConfig(), ["run"], {
      piAgentDir: "/agent",
    });
    assert.ok(binSpawn.command.length > 0);
    assert.equal(binSpawn.env.PI_CODING_AGENT_DIR, "/agent");
  });

  it("resolves node runtime from npm_node_execpath", async () => {
    const nodePath = join(tmpdir(), `node-bin-${process.pid}`);
    writeFileSync(nodePath, "", "utf8");
    process.env.npm_node_execpath = nodePath;
    process.env.PI_BIN = join(tmpdir(), "pi-cli.js");

    const { resolveCloudPiSpawn } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    const fromEnv = resolveCloudPiSpawn(mockConfig(), [], { piAgentDir: "/agent" });
    assert.equal(fromEnv.command, nodePath);
    rmSync(nodePath, { force: true });
  });

  it("resolves node runtime from which node", async () => {
    const nodePath = join(tmpdir(), `node-which-${process.pid}`);
    writeFileSync(nodePath, "", "utf8");
    delete process.env.npm_node_execpath;
    process.env.PI_BIN = join(tmpdir(), "pi-cli.js");
    mock.module("node:child_process", {
      cache: false,
      namedExports: {
        ...actualChildProcess,
        execSync: (cmd: string) => {
          if (cmd === "which node") return `${nodePath}\n`;
          throw new Error("missing");
        },
      },
    });

    const { resolveCloudPiSpawn } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    const fromWhich = resolveCloudPiSpawn(mockConfig(), [], { piAgentDir: "/agent" });
    assert.equal(fromWhich.command, nodePath);
    rmSync(nodePath, { force: true });
  });

  it("resolves vendored pi from repository root discovery", async () => {
    delete process.env.PI_BIN;
    const { resolveCloudPiBin } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    const resolved = resolveCloudPiBin(mockConfig());
    assert.ok(resolved.includes("coding-agent/dist/cli.js"));
  });

  it("falls back to process.execPath when node lookup fails", async () => {
    delete process.env.PI_BIN;
    delete process.env.PI_NODE;
    delete process.env.npm_node_execpath;
    process.env.PI_BIN = join(tmpdir(), "pi-cli.js");
    mock.module("node:child_process", {
      cache: false,
      namedExports: {
        ...actualChildProcess,
        execSync: () => {
          throw new Error("missing");
        },
      },
    });
    const { resolveCloudPiSpawn } = await importFresh<typeof import("../src/pi-runtime.js")>(
      "../src/pi-runtime.js",
    );
    const spawn = resolveCloudPiSpawn(mockConfig(), [], { piAgentDir: "/agent" });
    assert.equal(spawn.command, process.execPath);
  });
});
