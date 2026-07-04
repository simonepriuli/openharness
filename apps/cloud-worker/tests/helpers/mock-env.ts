import { mock } from "node:test";

export function mockNoEnvLoad(): void {
  mock.module("../../src/load-env.js", {
    cache: false,
    namedExports: {
      loadCloudWorkerEnv: () => undefined,
    },
  });
}
