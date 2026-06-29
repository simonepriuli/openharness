import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { requireOrg, requireOrgAdmin } from "./context.js";

function mockContext(values: {
  user?: { id: string } | null;
  org?: {
    memberId: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
  } | null;
}) {
  const store = new Map<string, unknown>();
  if (values.user !== undefined) store.set("user", values.user);
  if (values.org !== undefined) store.set("org", values.org);
  return {
    get: (key: string) => store.get(key) ?? null,
  };
}

describe("org middleware helpers", () => {
  it("requireOrg returns membership when present", () => {
    const org = {
      memberId: "m1",
      organizationId: "org-1",
      organizationName: "Acme",
      organizationSlug: "acme",
      cloudWorkersEnabled: false,
      role: "member",
    };
    assert.deepEqual(requireOrg(mockContext({ org }) as never), org);
  });

  it("requireOrg returns null without membership", () => {
    assert.equal(requireOrg(mockContext({ org: null }) as never), null);
  });

  it("requireOrgAdmin allows owner and admin only", () => {
    const ownerOrg = {
      memberId: "m1",
      organizationId: "org-1",
      organizationName: "Acme",
      organizationSlug: "acme",
      cloudWorkersEnabled: true,
      role: "owner",
    };
    const memberOrg = { ...ownerOrg, role: "member" };
    assert.deepEqual(requireOrgAdmin(mockContext({ org: ownerOrg }) as never), ownerOrg);
    assert.equal(requireOrgAdmin(mockContext({ org: memberOrg }) as never), null);
  });
});
