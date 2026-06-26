"use strict";

/**
 * SỬA RULE Ở ĐÂY THÌ PHẢI SỬA CẢ BẢN FRONTEND
 * `SerialCommander-EndUser-main/src/utils/scenarioFlowValidator.ts` (port 1:1). Xem test đối chiếu
 * `SerialCommander-EndUser-main/src/utils/scenarioFileValidator.parity.test.ts`.
 */
const VALID_OPS = ["contains", "matches", "empty", "not_empty"];
const VALID_HANDLES = ["next", "true", "false"];

/**
 * Kiểm tra trường Flow (đồ thị luồng 2D) trong file kịch bản.
 * @param {unknown} flow
 * @param {Array} content - Mảng Content đã parse
 * @returns {{ errors: Array<{message, path, line, column}>, warnings: Array }}
 */
function validateScenarioFlow(flow, content) {
  const errors = [];
  const warnings = [];

  if (flow === undefined || flow === null) return { errors, warnings };
  if (typeof flow !== "object" || Array.isArray(flow)) {
    errors.push({
      message: 'Field "Flow" must be an object { nodes, edges }.',
      path: "Flow",
      line: null,
      column: null,
    });
    return { errors, warnings };
  }

  const nodes = flow.nodes;
  const edges = flow.edges;

  if (!Array.isArray(nodes)) {
    errors.push({
      message: "Flow.nodes must be an array.",
      path: "Flow.nodes",
      line: null,
      column: null,
    });
    return { errors, warnings };
  }

  if (!Array.isArray(edges)) {
    errors.push({
      message: "Flow.edges must be an array.",
      path: "Flow.edges",
      line: null,
      column: null,
    });
    return { errors, warnings };
  }

  const contentNos = new Set(
    Array.isArray(content) ? content.map((_, i) => i) : []
  );
  if (Array.isArray(content)) {
    content.forEach((item, index) => {
      if (item && typeof item === "object") contentNos.add(index);
    });
  }

  const blockNosFromContent = new Set();
  if (Array.isArray(content)) {
    content.forEach((_, index) => blockNosFromContent.add(index));
  }

  const nodeIds = new Set();

  nodes.forEach((node, index) => {
    const base = `Flow.nodes[${index}]`;
    if (!node || typeof node !== "object") {
      errors.push({
        message: `${base} is not an object.`,
        path: base,
        line: null,
        column: null,
      });
      return;
    }

    if (typeof node.id !== "string" || !node.id.trim()) {
      errors.push({ message: `${base}.id is required.`, path: `${base}.id`, line: null, column: null });
    } else {
      nodeIds.add(node.id);
    }

    if (node.kind !== "block" && node.kind !== "condition") {
      errors.push({
        message: `${base}.kind must be "block" or "condition".`,
        path: `${base}.kind`,
        line: null,
        column: null,
      });
      return;
    }

    if (node.kind === "block") {
      if (typeof node.blockNo !== "number") {
        errors.push({
          message: `${base}.blockNo must be a number (block index in Content).`,
          path: `${base}.blockNo`,
          line: null,
          column: null,
        });
      } else if (!blockNosFromContent.has(node.blockNo) && node.blockNo >= (content?.length ?? 0)) {
        warnings.push({
          message: `${base} references blockNo ${node.blockNo} which may not match Content (by array order).`,
          path: `${base}.blockNo`,
          line: null,
          column: null,
        });
      }
    }

    if (node.kind === "condition") {
      const c = node.condition;
      if (!c || typeof c !== "object") {
        errors.push({
          message: `${base}.condition is required for condition nodes.`,
          path: `${base}.condition`,
          line: null,
          column: null,
        });
      } else {
        if (typeof c.blockNo !== "number") {
          errors.push({
            message: `${base}.condition.blockNo must be a number.`,
            path: `${base}.condition.blockNo`,
            line: null,
            column: null,
          });
        }
        if (!VALID_OPS.includes(c.op)) {
          errors.push({
            message: `${base}.condition.op is invalid. Valid values: ${VALID_OPS.join(", ")}.`,
            path: `${base}.condition.op`,
            line: null,
            column: null,
          });
        }
        if ((c.op === "contains" || c.op === "matches") && (!c.value || String(c.value).trim() === "")) {
          warnings.push({
            message: `${base}.condition should have a value when op=${c.op}.`,
            path: `${base}.condition.value`,
            line: null,
            column: null,
          });
        }
      }

      const hasTrue = edges.some((e) => e && e.source === node.id && e.sourceHandle === "true");
      const hasFalse = edges.some((e) => e && e.source === node.id && e.sourceHandle === "false");
      if (!hasTrue) {
        warnings.push({
          message: `Condition "${node.id}" is not connected to a true branch.`,
          path: "Flow.edges",
          line: null,
          column: null,
        });
      }
      if (!hasFalse) {
        warnings.push({
          message: `Condition "${node.id}" is not connected to a false branch.`,
          path: "Flow.edges",
          line: null,
          column: null,
        });
      }
    }
  });

  edges.forEach((edge, index) => {
    const base = `Flow.edges[${index}]`;
    if (!edge || typeof edge !== "object") {
      errors.push({ message: `${base} is not an object.`, path: base, line: null, column: null });
      return;
    }
    if (!nodeIds.has(edge.source)) {
      errors.push({
        message: `${base}.source "${edge.source}" does not exist in Flow.nodes.`,
        path: `${base}.source`,
        line: null,
        column: null,
      });
    }
    if (!nodeIds.has(edge.target)) {
      errors.push({
        message: `${base}.target "${edge.target}" does not exist in Flow.nodes.`,
        path: `${base}.target`,
        line: null,
        column: null,
      });
    }
    if (!VALID_HANDLES.includes(edge.sourceHandle)) {
      errors.push({
        message: `${base}.sourceHandle must be next, true, or false.`,
        path: `${base}.sourceHandle`,
        line: null,
        column: null,
      });
    }
  });

  return { errors, warnings };
}

module.exports = { validateScenarioFlow, VALID_OPS };
