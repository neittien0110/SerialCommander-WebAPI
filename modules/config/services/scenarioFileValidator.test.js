"use strict";

const {
  validateScenarioFile,
  positionToLineColumn,
  getSyntaxErrorPosition,
} = require("./scenarioFileValidator");

const { VALID_CONTENT_TYPES } = require("./scenarioFileValidator");

describe("scenarioFileValidator", () => {
  test("valid minimal scenario JSON", () => {
    const json = JSON.stringify({
      Name: "Test",
      Content: [{ Type: "text", Name: "A" }],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  // ── chart block type ────────────────────────────────────────────────────────

  test("VALID_CONTENT_TYPES includes chart", () => {
    expect(VALID_CONTENT_TYPES).toContain("chart");
  });

  test("accepts chart as a valid Content Type", () => {
    const json = JSON.stringify({
      Name: "IoT Demo",
      Content: [
        { Type: "chart", Name: "Nhiệt độ" },
      ],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  test("toogle legacy alias → warning + chuẩn hóa toggle", () => {
    const json = JSON.stringify({
      Name: "Legacy",
      Content: [{ Type: "toogle", Name: "Switch" }],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /toogle/i.test(w.message))).toBe(true);
  });

  test("accepts chart alongside gauge and progress", () => {
    const json = JSON.stringify({
      Name: "Sensor board",
      Content: [
        { Type: "button",   Name: "Poll"        },
        { Type: "gauge",    Name: "Nhiệt độ"    },
        { Type: "progress", Name: "Độ ẩm"       },
        { Type: "chart",    Name: "Lịch sử nhiệt độ" },
      ],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  test("chart with PollIntervalMs field passes without error", () => {
    const json = JSON.stringify({
      Name: "Chart self-poll",
      Content: [
        {
          Type: "chart",
          Name: "Nhiệt độ (live)",
          TxFormats: ["READ_SENSOR"],
          Params: [{ Name: "°C", Min: -10, Max: 60 }],
          RxParser: "json:temp",
          PollIntervalMs: 2000,
        },
      ],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
  });

  test("warns when multiple blocks poll", () => {
    const json = JSON.stringify({
      Name: "Multi poll",
      Content: [
        { Type: "button", Name: "A", TxFormats: ["A"], PollIntervalMs: 500 },
        { Type: "gauge", Name: "B", TxFormats: ["B"], PollIntervalMs: 500 },
      ],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /PollIntervalMs/.test(w.message))).toBe(true);
    expect(r.warnings.some((w) => /RxSourceBlockNo/.test(w.message))).toBe(true);
  });

  test("warns when aggregate poll rate exceeds budget", () => {
    const json = JSON.stringify({
      Name: "Fast poll",
      Content: [
        { Type: "button", Name: "A", TxFormats: ["A"], PollIntervalMs: 50 },
        { Type: "button", Name: "B", TxFormats: ["B"], PollIntervalMs: 50 },
        { Type: "button", Name: "C", TxFormats: ["C"], PollIntervalMs: 50 },
      ],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /lệnh\/s/.test(w.message))).toBe(true);
  });

  test("warns PollIntervalMs below minimum", () => {
    const json = JSON.stringify({
      Name: "Too fast",
      Content: [{ Type: "button", Name: "A", TxFormats: ["A"], PollIntervalMs: 10 }],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /50/.test(w.message))).toBe(true);
  });

  test("warns PollIntervalMs set nhưng TxFormats rỗng — poll sẽ không gửi lệnh", () => {
    const json = JSON.stringify({
      Name: "No cmd",
      Content: [{ Type: "button", Name: "A", TxFormats: [], PollIntervalMs: 500 }],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /TxFormats/.test(w.message) && /trống/.test(w.message))).toBe(true);
  });

  test("warns PollIntervalMs set nhưng TxFormats thiếu — poll sẽ không gửi lệnh", () => {
    const json = JSON.stringify({
      Name: "No txformats field",
      Content: [{ Type: "button", Name: "A", PollIntervalMs: 500 }],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /TxFormats/.test(w.message) && /trống/.test(w.message))).toBe(true);
  });

  test("rejects empty or whitespace input", () => {
    expect(validateScenarioFile("   ").valid).toBe(false);
    expect(validateScenarioFile("").valid).toBe(false);
  });

  test("rejects non-string input", () => {
    const r = validateScenarioFile(null);
    expect(r.valid).toBe(false);
    expect(r.errors[0].message).toMatch(/phải là chuỗi/i);
  });

  test("rejects invalid Content Type enum", () => {
    const json = JSON.stringify({
      Name: "T",
      Content: [{ Type: "not_a_valid_type", Name: "A" }],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path && String(e.path).includes("Type"))).toBe(true);
  });

  test("rejects missing Name at root", () => {
    const json = JSON.stringify({ Content: [] });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(false);
  });

  test("positionToLineColumn", () => {
    expect(positionToLineColumn("a\nb", 0)).toEqual({ line: 1, column: 0 });
    expect(positionToLineColumn("a\nb", 2)).toEqual({ line: 2, column: 0 });
  });

  test("getSyntaxErrorPosition parses JSON error position", () => {
    const err = new SyntaxError("Unexpected token at position 3");
    err.message = "Unexpected token at position 3";
    const pos = getSyntaxErrorPosition('{"x"', err);
    expect(pos).not.toBeNull();
    if (pos) {
      expect(pos.line).toBeGreaterThanOrEqual(1);
    }
  });

  test("accepts optional Flow with block nodes", () => {
    const json = JSON.stringify({
      Name: "Flow demo",
      Content: [{ Type: "text", Name: "A" }, { Type: "button", Name: "B" }],
      Flow: {
        nodes: [
          { id: "block-0", kind: "block", blockNo: 0, position: { x: 0, y: 0 } },
          { id: "block-1", kind: "block", blockNo: 1, position: { x: 0, y: 100 } },
        ],
        edges: [
          { id: "e1", source: "block-0", target: "block-1", sourceHandle: "next" },
        ],
      },
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
  });

  test("warns Flow condition missing branches", () => {
    const json = JSON.stringify({
      Name: "Cond",
      Content: [{ Type: "text", Name: "A" }],
      Flow: {
        nodes: [
          {
            id: "cond-1",
            kind: "condition",
            position: { x: 0, y: 0 },
            condition: { blockNo: 0, op: "contains", value: "OK" },
          },
        ],
        edges: [],
      },
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /true/i.test(w.message))).toBe(true);
  });
});
