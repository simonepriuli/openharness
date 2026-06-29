import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { requireCloudWorkerAuth } from "./internal-auth.js";

function createTestApp() {
  const app = new Hono();
  app.get("/pending", (c) => {
    if (!requireCloudWorkerAuth(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json({ route: "pending" });
  });
  app.get("/:id", (c) => {
    if (!requireCloudWorkerAuth(c)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return c.json({ route: "by-id", id: c.req.param("id") });
  });
  return app;
}

describe("cloud worker internal route ordering", () => {
  const originalSecret = process.env.CLOUD_WORKER_SECRET;

  it("matches /pending before /:id", async () => {
    process.env.CLOUD_WORKER_SECRET = "worker-secret";
    const app = createTestApp();
    const response = await app.request("/pending", {
      headers: { authorization: "Bearer worker-secret" },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { route: string };
    assert.equal(body.route, "pending");

    if (originalSecret === undefined) {
      delete process.env.CLOUD_WORKER_SECRET;
    } else {
      process.env.CLOUD_WORKER_SECRET = originalSecret;
    }
  });
});
