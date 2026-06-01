import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitJsonlLines } from "./jsonl.js";

describe("splitJsonlLines", () => {
  it("splits on LF only", () => {
    const { lines, remainder } = splitJsonlLines('{"a":1}\n{"b":2}\n');
    assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);
    assert.equal(remainder, "");
  });

  it("strips trailing CR", () => {
    const { lines } = splitJsonlLines('{"a":1}\r\n');
    assert.deepEqual(lines, ['{"a":1}']);
  });

  it("keeps incomplete line in remainder", () => {
    const { lines, remainder } = splitJsonlLines('{"a":1}\n{"par');
    assert.deepEqual(lines, ['{"a":1}']);
    assert.equal(remainder, '{"par');
  });

  it("does not split on Unicode line separators inside JSON", () => {
    const json = '{"text":"line1\u2028line2"}';
    const { lines, remainder } = splitJsonlLines(`${json}\n`);
    assert.deepEqual(lines, [json]);
    assert.equal(remainder, "");
  });
});
