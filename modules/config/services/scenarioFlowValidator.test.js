const { validateScenarioFlow } = require("./scenarioFlowValidator");

function ok(result) {
  expect(result.errors).toHaveLength(0);
}

function noWarn(result) {
  expect(result.warnings).toHaveLength(0);
}

describe("validateScenarioFlow", () => {
  test("trả {errors:[], warnings:[]} khi flow=null", () => {
    const r = validateScenarioFlow(null, []);
    ok(r);
    noWarn(r);
  });

  test("trả {errors:[], warnings:[]} khi flow=undefined", () => {
    const r = validateScenarioFlow(undefined, []);
    ok(r);
    noWarn(r);
  });

  test("error khi flow là array (không phải object)", () => {
    const r = validateScenarioFlow([], []);
    expect(r.errors[0].message).toContain('"Flow" must be an object');
  });

  test("error khi flow là string", () => {
    const r = validateScenarioFlow("invalid", []);
    expect(r.errors[0].message).toContain('"Flow" must be an object');
  });

  test("error khi flow.nodes không phải array", () => {
    const r = validateScenarioFlow({ nodes: "bad", edges: [] }, []);
    expect(r.errors[0].message).toContain("Flow.nodes must be an array");
  });

  test("error khi flow.edges không phải array", () => {
    const r = validateScenarioFlow({ nodes: [], edges: null }, []);
    expect(r.errors[0].message).toContain("Flow.edges must be an array");
  });

  test("không lỗi khi nodes và edges đều rỗng", () => {
    const r = validateScenarioFlow({ nodes: [], edges: [] }, []);
    ok(r);
    noWarn(r);
  });

  describe("node validation", () => {
    test("error khi node không phải object", () => {
      const r = validateScenarioFlow({ nodes: ["bad"], edges: [] }, []);
      expect(r.errors[0].message).toContain("is not an object");
    });

    test("error khi node.id thiếu/rỗng", () => {
      const r = validateScenarioFlow({ nodes: [{ id: "  ", kind: "block", blockNo: 0 }], edges: [] }, [{ cmd: "AT" }]);
      expect(r.errors.some((e) => e.message.includes(".id is required"))).toBe(true);
    });

    test("error khi node.kind không hợp lệ", () => {
      const r = validateScenarioFlow({ nodes: [{ id: "n1", kind: "invalid" }], edges: [] }, []);
      expect(r.errors.some((e) => e.message.includes('must be "block" or "condition"'))).toBe(true);
    });

    test("error khi block node.blockNo không phải number", () => {
      const r = validateScenarioFlow({ nodes: [{ id: "n1", kind: "block", blockNo: "x" }], edges: [] }, []);
      expect(r.errors.some((e) => e.message.includes(".blockNo must be a number"))).toBe(true);
    });

    test("warning khi block node.blockNo vượt quá content length", () => {
      const r = validateScenarioFlow({ nodes: [{ id: "n1", kind: "block", blockNo: 99 }], edges: [] }, [{ cmd: "AT" }]);
      expect(r.warnings.some((w) => w.message.includes("blockNo 99"))).toBe(true);
    });

    test("không warning khi blockNo nằm trong content range", () => {
      const r = validateScenarioFlow(
        { nodes: [{ id: "n1", kind: "block", blockNo: 0 }], edges: [] },
        [{ cmd: "AT" }]
      );
      ok(r);
    });
  });

  describe("condition node validation", () => {
    function condNode(overrides = {}) {
      return {
        id: "c1",
        kind: "condition",
        condition: { blockNo: 0, op: "contains", value: "OK", ...overrides.condition },
        ...overrides,
      };
    }

    test("error khi condition field thiếu", () => {
      const r = validateScenarioFlow({ nodes: [{ id: "c1", kind: "condition" }], edges: [] }, []);
      expect(r.errors.some((e) => e.message.includes(".condition is required"))).toBe(true);
    });

    test("error khi condition.blockNo không phải number", () => {
      const r = validateScenarioFlow({ nodes: [condNode({ condition: { blockNo: "x", op: "contains", value: "OK" } })], edges: [] }, []);
      expect(r.errors.some((e) => e.message.includes("condition.blockNo must be a number"))).toBe(true);
    });

    test("error khi condition.op không hợp lệ", () => {
      const r = validateScenarioFlow({ nodes: [condNode({ condition: { blockNo: 0, op: "unknown", value: "x" } })], edges: [] }, []);
      expect(r.errors.some((e) => e.message.includes("condition.op is invalid"))).toBe(true);
    });

    test("warning khi op=contains nhưng value trống", () => {
      const r = validateScenarioFlow({ nodes: [condNode({ condition: { blockNo: 0, op: "contains", value: "" } })], edges: [] }, []);
      expect(r.warnings.some((w) => w.message.includes("should have a value"))).toBe(true);
    });

    test("warning khi op=matches nhưng value trống", () => {
      const r = validateScenarioFlow({ nodes: [condNode({ condition: { blockNo: 0, op: "matches", value: "" } })], edges: [] }, []);
      expect(r.warnings.some((w) => w.message.includes("should have a value"))).toBe(true);
    });

    test("không warning khi op=empty (không cần value)", () => {
      const r = validateScenarioFlow({ nodes: [condNode({ condition: { blockNo: 0, op: "empty" } })], edges: [
        { source: "c1", target: "n1", sourceHandle: "true" },
        { source: "c1", target: "n2", sourceHandle: "false" },
      ] }, []);
      expect(r.warnings.filter((w) => w.message.includes("should have a value"))).toHaveLength(0);
    });

    test("warning khi condition node không có true branch", () => {
      const r = validateScenarioFlow({
        nodes: [condNode()],
        edges: [{ source: "c1", target: "x", sourceHandle: "false" }],
      }, []);
      expect(r.warnings.some((w) => w.message.includes("not connected to a true branch"))).toBe(true);
    });

    test("warning khi condition node không có false branch", () => {
      const r = validateScenarioFlow({
        nodes: [condNode()],
        edges: [{ source: "c1", target: "x", sourceHandle: "true" }],
      }, []);
      expect(r.warnings.some((w) => w.message.includes("not connected to a false branch"))).toBe(true);
    });
  });

  describe("edge validation", () => {
    test("error khi edge không phải object", () => {
      const r = validateScenarioFlow({ nodes: [], edges: [null] }, []);
      expect(r.errors[0].message).toContain("is not an object");
    });

    test("error khi edge.source không tồn tại trong nodes", () => {
      const r = validateScenarioFlow({
        nodes: [{ id: "n1", kind: "block", blockNo: 0 }],
        edges: [{ source: "no-such-id", target: "n1", sourceHandle: "next" }],
      }, [{ cmd: "AT" }]);
      expect(r.errors.some((e) => e.message.includes("does not exist in Flow.nodes"))).toBe(true);
    });

    test("error khi edge.target không tồn tại trong nodes", () => {
      const r = validateScenarioFlow({
        nodes: [{ id: "n1", kind: "block", blockNo: 0 }],
        edges: [{ source: "n1", target: "no-such-id", sourceHandle: "next" }],
      }, [{ cmd: "AT" }]);
      expect(r.errors.some((e) => e.message.includes(".target"))).toBe(true);
    });

    test("error khi edge.sourceHandle không hợp lệ", () => {
      const r = validateScenarioFlow({
        nodes: [
          { id: "n1", kind: "block", blockNo: 0 },
          { id: "n2", kind: "block", blockNo: 0 },
        ],
        edges: [{ source: "n1", target: "n2", sourceHandle: "invalid" }],
      }, [{ cmd: "AT" }]);
      expect(r.errors.some((e) => e.message.includes("sourceHandle must be next, true, or false"))).toBe(true);
    });

    test("không lỗi cho edge hợp lệ với sourceHandle=next", () => {
      const r = validateScenarioFlow({
        nodes: [
          { id: "n1", kind: "block", blockNo: 0 },
          { id: "n2", kind: "block", blockNo: 0 },
        ],
        edges: [{ source: "n1", target: "n2", sourceHandle: "next" }],
      }, [{ cmd: "AT" }, { cmd: "AT+RST" }]);
      ok(r);
    });
  });
});
