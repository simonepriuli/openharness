import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHeatmapGrid,
  computeCurrentStreak,
  computeIntensityLevel,
  computeLongestStreak,
  computeMostActiveDay,
  computeMostActiveMonth,
  formatHeatmapDateRange,
} from "./token-usage-stats.js";

describe("computeIntensityLevel", () => {
  it("returns 0 for empty days", () => {
    assert.equal(computeIntensityLevel(0, 100), 0);
  });

  it("maps values into four non-zero levels", () => {
    assert.equal(computeIntensityLevel(10, 100), 1);
    assert.equal(computeIntensityLevel(30, 100), 2);
    assert.equal(computeIntensityLevel(60, 100), 3);
    assert.equal(computeIntensityLevel(90, 100), 4);
  });
});

describe("buildHeatmapGrid", () => {
  it("produces 53 week columns with 7 day rows each", () => {
    const grid = buildHeatmapGrid({}, new Date(2026, 6, 2));
    assert.equal(grid.weeks.length, 53);
    for (const week of grid.weeks) {
      assert.equal(week.length, 7);
    }
  });

  it("places daily totals on the matching calendar date", () => {
    const grid = buildHeatmapGrid({ "2026-07-02": 500 }, new Date(2026, 6, 2));
    const cell = grid.weeks.flat().find((entry) => entry.date === "2026-07-02");
    assert.equal(cell?.tokens, 500);
    assert.equal(cell?.level, 4);
  });

  it("returns a readable date range", () => {
    const grid = buildHeatmapGrid({}, new Date(2026, 6, 2));
    const range = formatHeatmapDateRange(grid.startDate, grid.endDate);
    assert.match(range, /–/);
    assert.match(range, /2026/);
  });
});

describe("derived usage stats", () => {
  const daily = {
    "2026-06-28": 100,
    "2026-06-29": 200,
    "2026-06-30": 300,
    "2026-07-01": 50,
    "2026-07-02": 400,
  };

  it("finds the most active month", () => {
    assert.equal(computeMostActiveMonth(daily), "June");
  });

  it("finds the most active day", () => {
    assert.equal(computeMostActiveDay(daily), "Jul 2, 2026");
  });

  it("computes longest streak across gaps", () => {
    const withGap = {
      ...daily,
      "2026-07-10": 10,
      "2026-07-11": 10,
    };
    assert.equal(computeLongestStreak(withGap), 5);
  });

  it("returns 0 current streak when today has no usage", () => {
    assert.equal(computeCurrentStreak(daily, new Date(2026, 6, 3)), 0);
  });

  it("counts current streak ending today", () => {
    assert.equal(computeCurrentStreak(daily, new Date(2026, 6, 2)), 5);
  });
});
