import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { connectionRepoKey, planConnectionDedupe } from "../src/connection-dedupe.js";

describe("connectionRepoKey", () => {
  it("normalizes owner and repo case", () => {
    const key = connectionRepoKey({
      id: "1",
      organizationId: "org-1",
      installationId: "inst-1",
      githubOwner: "Acme",
      githubRepo: "Repo",
      createdAt: new Date(),
    });
    assert.equal(key, "org-1:inst-1:acme:repo");
  });
});

describe("planConnectionDedupe", () => {
  it("keeps the oldest connection per org/repo", () => {
    const plans = planConnectionDedupe([
      {
        id: "newer",
        organizationId: "org-1",
        installationId: "inst-1",
        githubOwner: "acme",
        githubRepo: "repo",
        createdAt: new Date("2026-02-01"),
      },
      {
        id: "older",
        organizationId: "org-1",
        installationId: "inst-1",
        githubOwner: "acme",
        githubRepo: "repo",
        createdAt: new Date("2026-01-01"),
      },
    ]);

    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.canonicalId, "older");
    assert.deepEqual(plans[0]?.duplicateIds, ["newer"]);
  });

  it("returns no plan for unique repos", () => {
    const plans = planConnectionDedupe([
      {
        id: "a",
        organizationId: "org-1",
        installationId: "inst-1",
        githubOwner: "acme",
        githubRepo: "a",
        createdAt: new Date("2026-01-01"),
      },
      {
        id: "b",
        organizationId: "org-1",
        installationId: "inst-1",
        githubOwner: "acme",
        githubRepo: "b",
        createdAt: new Date("2026-01-02"),
      },
    ]);
    assert.equal(plans.length, 0);
  });
});
