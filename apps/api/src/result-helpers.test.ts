import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Result } from "better-result";
import {
  AzureDevOpsApiError,
  BatchTooLargeError,
  ClaimConflictError,
  GithubApiError,
  LinearApiError,
  NotifyError,
  OAuthError,
  OrgDbError,
  OrgSecretsError,
  RepoEnvironmentError,
  RunNotActiveError,
  RunNotFoundError,
  ValidationError,
} from "./errors.js";
import {
  mapAzureDevOpsApiError,
  mapDiscordApiError,
  mapGithubApiError,
  mapLinearApiError,
  mapOrgError,
  mapOrgSecretsError,
  mapRepoEnvironmentError,
  mapRunEventsError,
  mapTeamsApiError,
  runEventsErrorCode,
  unwrapResult,
  wrapClaimResult,
} from "./result-helpers.js";

describe("mapRunEventsError", () => {
  it("maps run event errors to HTTP status codes", () => {
    const cases = [
      { error: new RunNotFoundError({ message: "missing" }), status: 404, code: "RUN_NOT_FOUND" },
      {
        error: new RunNotActiveError({ message: "inactive" }),
        status: 409,
        code: "RUN_NOT_ACTIVE",
      },
      {
        error: new BatchTooLargeError({ message: "too many" }),
        status: 400,
        code: "BATCH_TOO_LARGE",
      },
    ] as const;

    for (const { error, status, code } of cases) {
      const mapped = mapRunEventsError(error);
      assert.equal(mapped.status, status);
      assert.equal(mapped.code, code);
    }
  });
});

describe("runEventsErrorCode", () => {
  it("returns stable error codes for tagged errors", () => {
    assert.equal(
      runEventsErrorCode(new RunNotActiveError({ message: "Workflow run is not accepting events" })),
      "RUN_NOT_ACTIVE",
    );
  });
});

describe("wrapClaimResult", () => {
  it("wraps missing runs as claim conflicts", () => {
    const result = wrapClaimResult("run-1", null);
    assert.equal(Result.isError(result), true);
    if (Result.isError(result)) {
      assert.equal(ClaimConflictError.is(result.error), true);
      assert.match(result.error.message, /not available/i);
    }
  });

  it("returns ok when a run is present", () => {
    const run = { id: "run-1" };
    const result = wrapClaimResult("run-1", run);
    assert.equal(Result.isOk(result), true);
    if (Result.isOk(result)) {
      assert.deepEqual(result.value, run);
    }
  });
});

describe("NotifyError", () => {
  it("carries HTTP status for notify failures", () => {
    const error = new NotifyError({ status: 503, message: "Discord bot is not configured" });
    assert.equal(error.status, 503);
    assert.equal(error.message, "Discord bot is not configured");
  });
});

describe("mapOrgError", () => {
  it("maps validation errors to 400 and not-found errors to 404", () => {
    const validation = mapOrgError(
      new OrgDbError({ code: "INVALID_CODE", message: "Invalid invite code" }),
    );
    assert.equal(validation.status, 400);
    assert.equal(validation.code, "INVALID_CODE");

    const notFound = mapOrgError(
      new OrgDbError({ code: "ORG_NOT_FOUND", message: "Organization not found" }),
    );
    assert.equal(notFound.status, 404);
    assert.equal(notFound.code, "ORG_NOT_FOUND");
  });

  it("maps infrastructure allocation failures to 500", () => {
    const slugConflict = mapOrgError(
      new OrgDbError({ code: "SLUG_CONFLICT", message: "Could not allocate a unique organization slug" }),
    );
    assert.equal(slugConflict.status, 500);
    assert.equal(slugConflict.code, "SLUG_CONFLICT");
  });
});

describe("mapOrgSecretsError", () => {
  it("maps org secret errors to 400", () => {
    const mapped = mapOrgSecretsError(
      new OrgSecretsError({ code: "INVALID_SLOT", message: "Unknown secret slot" }),
    );
    assert.equal(mapped.status, 400);
    assert.equal(mapped.code, "INVALID_SLOT");
    assert.equal(mapped.message, "Unknown secret slot");
  });
});

describe("mapRepoEnvironmentError", () => {
  it("maps connection-not-found to 404 and validation errors to 400", () => {
    const notFound = mapRepoEnvironmentError(
      new RepoEnvironmentError({
        code: "CONNECTION_NOT_FOUND",
        message: "Connection not found",
      }),
    );
    assert.equal(notFound.status, 404);
    assert.equal(notFound.code, "CONNECTION_NOT_FOUND");

    const invalid = mapRepoEnvironmentError(
      new RepoEnvironmentError({ code: "INVALID_KEY", message: "Invalid key" }),
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.code, "INVALID_KEY");
  });
});

describe("mapLinearApiError", () => {
  it("maps Linear client and API errors to 400", () => {
    const apiError = mapLinearApiError(new LinearApiError({ message: "GraphQL failed" }));
    assert.equal(apiError.status, 400);
    assert.equal(apiError.message, "GraphQL failed");

    const oauthError = mapLinearApiError(new OAuthError({ message: "Token exchange failed" }));
    assert.equal(oauthError.status, 400);

    const validationError = mapLinearApiError(new ValidationError({ message: "teamId is required" }));
    assert.equal(validationError.status, 400);
  });
});

describe("unwrapResult", () => {
  it("returns the value for ok results", () => {
    assert.equal(unwrapResult(Result.ok(42)), 42);
  });

  it("throws the error value for err results", () => {
    const error = new GithubApiError({ message: "failed", status: 500 });
    assert.throws(() => unwrapResult(Result.err(error)), (thrown: unknown) => thrown === error);
  });
});

describe("mapDiscordApiError", () => {
  it("maps OAuth errors to 400", () => {
    const mapped = mapDiscordApiError(new OAuthError({ message: "denied" }));
    assert.equal(mapped.status, 400);
    assert.equal(mapped.message, "denied");
  });
});

describe("mapTeamsApiError", () => {
  it("maps OAuth errors to 400", () => {
    const mapped = mapTeamsApiError(new OAuthError({ message: "denied" }));
    assert.equal(mapped.status, 400);
    assert.equal(mapped.message, "denied");
  });
});

describe("mapGithubApiError", () => {
  it("preserves 403 and 404 and maps other 4xx to 400", () => {
    assert.equal(
      mapGithubApiError(new GithubApiError({ message: "Forbidden", status: 403 })).status,
      403,
    );
    assert.equal(
      mapGithubApiError(new GithubApiError({ message: "Not found", status: 404 })).status,
      404,
    );
    assert.equal(
      mapGithubApiError(new GithubApiError({ message: "Bad request", status: 422 })).status,
      400,
    );
    assert.equal(
      mapGithubApiError(new GithubApiError({ message: "Server error", status: 502 })).status,
      500,
    );
  });
});

describe("mapAzureDevOpsApiError", () => {
  it("preserves 403 and 404 and maps other 4xx to 400", () => {
    assert.equal(
      mapAzureDevOpsApiError(new AzureDevOpsApiError({ message: "Forbidden", status: 403 }))
        .status,
      403,
    );
    assert.equal(
      mapAzureDevOpsApiError(
        new AzureDevOpsApiError({ message: "azure_devops_not_connected", status: 403 }),
      ).status,
      403,
    );
    assert.equal(
      mapAzureDevOpsApiError(new AzureDevOpsApiError({ message: "Not found", status: 404 }))
        .status,
      404,
    );
  });
});
