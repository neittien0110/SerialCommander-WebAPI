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
    expect(r.warnings.some((w) => /cmd\/s/.test(w.message))).toBe(true);
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
    expect(r.warnings.some((w) => /TxFormats/.test(w.message) && /empty/.test(w.message))).toBe(true);
  });

  test("warns PollIntervalMs set nhưng TxFormats thiếu — poll sẽ không gửi lệnh", () => {
    const json = JSON.stringify({
      Name: "No txformats field",
      Content: [{ Type: "button", Name: "A", PollIntervalMs: 500 }],
    });
    const r = validateScenarioFile(json);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => /TxFormats/.test(w.message) && /empty/.test(w.message))).toBe(true);
  });

  test("rejects empty or whitespace input", () => {
    expect(validateScenarioFile("   ").valid).toBe(false);
    expect(validateScenarioFile("").valid).toBe(false);
  });

  test("rejects non-string input", () => {
    const r = validateScenarioFile(null);
    expect(r.valid).toBe(false);
    expect(r.errors[0].message).toMatch(/must be a JSON string/i);
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

  // ── PollIntervalMs not a number (lines 76-82) ─────────────────────────────────
  test("warns khi PollIntervalMs không phải number", () => {
    const json = JSON.stringify({
      Name: "Bad poll",
      Content: [{ Type: "button", Name: "A", PollIntervalMs: "fast" }],
    });
    const r = validateScenarioFile(json);
    expect(r.warnings.some((w) => /must be a number/.test(w.message))).toBe(true);
  });

  // ── pathToJsonPointer empty path (line 165-166) ───────────────────────────────
  test("getSyntaxErrorPosition trả null khi err.message không có position", () => {
    const err = new SyntaxError("Unexpected end of JSON input");
    const pos = getSyntaxErrorPosition('{"x"', err);
    expect(pos).toBeNull();
  });

  // ── Root not object — string literal (lines 382-383) ────────────────────────
  test("lỗi khi root là chuỗi thay vì object", () => {
    const r = validateScenarioFile(JSON.stringify("just a string"));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /Root must be a JSON object/.test(e.message))).toBe(true);
  });

  // ── Content missing/null (lines 421-423) ─────────────────────────────────────
  test("lỗi khi Content bị thiếu", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "Test" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.path === "Content")).toBe(true);
  });

  // ── Content not array (line 201) ─────────────────────────────────────────────
  test("lỗi khi Content không phải array", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "Test", Content: "bad" }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /"Content" must be an array/.test(e.message))).toBe(true);
  });

  // ── Content element not object (lines 212-219) ───────────────────────────────
  test("lỗi khi Content element là null", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [null] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /is not an object/.test(e.message))).toBe(true);
  });

  // ── Type missing (lines 224-226) ─────────────────────────────────────────────
  test("lỗi khi Type bị thiếu", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [{ Name: "A" }] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /Type.*missing or invalid/.test(e.message))).toBe(true);
  });

  // ── Type not a string (lines 233-235) ────────────────────────────────────────
  test("lỗi khi Type là số thay vì chuỗi", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [{ Type: 42, Name: "A" }] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /must be a non-empty string/.test(e.message))).toBe(true);
  });

  // ── Name missing (lines 269-271) ─────────────────────────────────────────────
  test("lỗi khi Name của Content element bị thiếu", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [{ Type: "text" }] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /Field "Name".*missing/.test(e.message))).toBe(true);
  });

  // ── Name not string (lines 278-280) ──────────────────────────────────────────
  test("lỗi khi Name của Content element là số", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [{ Type: "text", Name: 99 }] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /Field "Name".*non-empty string/.test(e.message))).toBe(true);
  });

  // ── Labels not array (lines 290-292) ─────────────────────────────────────────
  test("cảnh báo khi Labels không phải array", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [{ Type: "text", Name: "A", Labels: "bad" }] }));
    expect(r.warnings.some((w) => /Labels.*should be an array/.test(w.message))).toBe(true);
  });

  // ── TxFormats not array (lines 302-304) ──────────────────────────────────────
  test("cảnh báo khi TxFormats không phải array", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [{ Type: "text", Name: "A", TxFormats: "bad" }] }));
    expect(r.warnings.some((w) => /TxFormats.*should be an array/.test(w.message))).toBe(true);
  });

  // ── Params not array (lines 314-316) ─────────────────────────────────────────
  test("cảnh báo khi Params không phải array", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [{ Type: "text", Name: "A", Params: "bad" }] }));
    expect(r.warnings.some((w) => /Params.*should be an array/.test(w.message))).toBe(true);
  });

  // ── Description not string (lines 409-411) ───────────────────────────────────
  test("cảnh báo khi Description không phải string", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [], Description: 123 }));
    expect(r.warnings.some((w) => /Description.*should be a string/.test(w.message))).toBe(true);
  });

  // ── Banners not array (lines 437-439) ────────────────────────────────────────
  test("cảnh báo khi Banners không phải array", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [], Banners: "banner" }));
    expect(r.warnings.some((w) => /Banners.*should be an array/.test(w.message))).toBe(true);
  });

  // ── Baudrate not number (lines 449-451) ──────────────────────────────────────
  test("cảnh báo khi Baudrate không phải number", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [], Baudrate: "9600" }));
    expect(r.warnings.some((w) => /Baudrate.*should be a number/.test(w.message))).toBe(true);
  });

  // ── Parity invalid (lines 461-463) ───────────────────────────────────────────
  test("cảnh báo khi Parity không hợp lệ", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [], Parity: "weird" }));
    expect(r.warnings.some((w) => /Parity.*should be one of/.test(w.message))).toBe(true);
  });

  // ── StopBits invalid (lines 473-475) ─────────────────────────────────────────
  test("cảnh báo khi StopBits không hợp lệ", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [], StopBits: 3 }));
    expect(r.warnings.some((w) => /StopBits.*should be 1/.test(w.message))).toBe(true);
  });

  // ── DataBits invalid (lines 484-486) ─────────────────────────────────────────
  test("cảnh báo khi DataBits không phải 7 hay 8", () => {
    const r = validateScenarioFile(JSON.stringify({ Name: "T", Content: [], DataBits: 9 }));
    expect(r.warnings.some((w) => /DataBits.*should be 7 or 8/.test(w.message))).toBe(true);
  });
});
