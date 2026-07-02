import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	formatCodexLimitError,
	formatCodexResetDelay,
	parseCodexUsageLimitMessage,
} from "./codex-limit-error.js";
import { formatHarnessError } from "./harness-errors.js";

describe("codex-limit-error", () => {
	it("formats reset delay in days for long windows", () => {
		assert.equal(formatCodexResetDelay(2_398_228), " Try again in ~28 days.");
  });

	it("parses legacy raw Codex JSON errors", () => {
		const raw =
			'Codex error: {"type":"error","error":{"type":"usage_limit_reached","message":"The usage limit has been reached","plan_type":"go","resets_in_seconds":2398228},"status_code":429}';
		const message = parseCodexUsageLimitMessage(raw);
		assert.equal(
			message,
			"You have hit your ChatGPT usage limit (go plan). Try again in ~28 days.",
		);
	});

	it("passes through already-friendly usage limit text", () => {
		const friendly = "You have hit your ChatGPT usage limit (go plan). Try again in ~28 days.";
		assert.equal(parseCodexUsageLimitMessage(friendly), friendly);
	});

	it("formats usage limit from error bodies", () => {
		const message = formatCodexLimitError(
			{
				type: "usage_limit_reached",
				plan_type: "go",
				resets_in_seconds: 2_398_228,
			},
			429,
		);
		assert.equal(
			message,
			"You have hit your ChatGPT usage limit (go plan). Try again in ~28 days.",
		);
	});
});

describe("harness-errors usage limit", () => {
	it("shows a dedicated notice for raw Codex usage limit JSON", () => {
		const raw =
			'Codex error: {"type":"error","error":{"type":"usage_limit_reached","message":"The usage limit has been reached","plan_type":"go","resets_in_seconds":2398228},"status_code":429}';
		const display = formatHarnessError(raw);
		assert.equal(display.title, "Usage limit reached");
		assert.equal(
			display.description,
			"You have hit your ChatGPT usage limit (go plan). Try again in ~28 days.",
		);
		assert.equal(display.code, "generic");
	});
});
