import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";
import { mockNoEnvLoad } from "./helpers/mock-env.js";
import { importFresh } from "./helpers/import-fresh.js";

describe("index entrypoint", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("detects entrypoint process argv", async () => {
    const { isEntrypointProcess } = await importFresh<typeof import("../src/index.js")>(
      "../src/index.js",
    );
    const indexPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
    assert.equal(isEntrypointProcess(["node", indexPath]), true);
    assert.equal(isEntrypointProcess(["node", "other.js"]), false);
    assert.equal(isEntrypointProcess(["node"]), false);
  });

  it("starts bootstrap flow from argv", async () => {
    mockNoEnvLoad();
    mock.module("../src/bootstrap.js", {
      cache: false,
      namedExports: {
        runCloudWorkerEntrypoint: mock.fn(async () => ({ kind: "exit" as const, code: 0 })),
        handleBootstrapResult: (result: { kind: string; code?: number }) => {
          if (result.kind === "exit") process.exit(result.code ?? 0);
        },
      },
    });
    const exit = mock.method(process, "exit", () => undefined as never);
    const { startFromArgv } = await importFresh<typeof import("../src/index.js")>(
      "../src/index.js",
    );
    await startFromArgv(["node", "index.js", "help"]);
    assert.equal(exit.mock.calls[0]?.arguments[0], 0);
    exit.mock.restore();
  });

  it("runs entrypoint when argv matches index module", async () => {
    mockNoEnvLoad();
    const runCloudWorkerEntrypoint = mock.fn(async () => ({ kind: "exit" as const, code: 0 }));
    mock.module("../src/bootstrap.js", {
      cache: false,
      namedExports: {
        runCloudWorkerEntrypoint,
        handleBootstrapResult: (result: { kind: string; code?: number }) => {
          if (result.kind === "exit") process.exit(result.code ?? 0);
        },
      },
    });

    const exit = mock.method(process, "exit", () => undefined as never);
    const indexPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
    const { runIfEntrypoint } = await importFresh<typeof import("../src/index.js")>(
      "../src/index.js",
    );
    await runIfEntrypoint(["node", indexPath]);
    assert.equal(runCloudWorkerEntrypoint.mock.calls.length, 1);
    assert.equal(exit.mock.calls[0]?.arguments[0], 0);
    exit.mock.restore();
  });
});
