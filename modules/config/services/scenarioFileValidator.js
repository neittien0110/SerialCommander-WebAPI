"use strict";

/**
 * SỬA RULE Ở ĐÂY THÌ PHẢI SỬA CẢ BẢN FRONTEND
 * `SerialCommander-EndUser-main/src/utils/scenarioFileValidator.ts` (port 1:1, dùng cho
 * auto-validate đồng bộ trong Scenario Designer). Xem test đối chiếu
 * `SerialCommander-EndUser-main/src/utils/scenarioFileValidator.parity.test.ts`.
 */
const jsonMap = require("json-source-map");
const { validateScenarioFlow } = require("./scenarioFlowValidator");

/**
 * Các kiểu khối Content hợp lệ (đồng bộ với frontend SerialAction BlockType).
 */
/** Canonical block types (ưu tiên chính tả đúng). */
const VALID_CONTENT_TYPES = [
  "text", "dropdown", "para", "button", "button2",
  "5directions", "slider", "slider2", "toggle", "toggle2",
  "var", "knob", "colorpicker", "numberinput", "joystick",
  "matrix", "gauge", "progress", "chart",
  // Legacy typo — vẫn chấp nhận, chuẩn hóa sang toggle* + cảnh báo
  "toogle", "toogle2",
];

/** Alias cũ → canonical (đồng bộ SerialAction BlockType). */
const CONTENT_TYPE_ALIASES = {
  toogle: "toggle",
  toogle2: "toggle2",
};

const DEPRECATED_TYPE_WARNINGS = {
  toogle: 'Type "toogle" is deprecated — use "toggle".',
  toogle2: 'Type "toogle2" is deprecated — use "toggle2".',
};

/** Khớp frontend: PollIntervalMs tối thiểu và ngân sách poll tổng khuyến nghị. */
const POLL_MIN_INTERVAL_MS = 50;
const MAX_AGGREGATE_POLL_HZ = 10;

/**
 * Lấy dòng/cột từ vị trí ký tự trong chuỗi (1-based).
 * @param {string} raw - Chuỗi JSON gốc
 * @param {number} pos - Vị trí ký tự (0-based)
 * @returns {{ line: number, column: number }}
 */
function positionToLineColumn(raw, pos) {
  const before = raw.slice(0, Math.max(0, pos));
  const lines = before.split(/\r\n|\r|\n/);
  const line = lines.length;
  const column = lines[lines.length - 1].length;
  return { line, column };
}

/**
 * Cảnh báo cấu hình PollIntervalMs — tránh scenario spam serial khi render.
 * @param {Array} content
 * @param {object} pointers
 * @returns {Array<{ message, path, line, column }>}
 */
function validatePollConfiguration(content, pointers) {
  const warnings = [];
  if (!Array.isArray(content)) return warnings;

  const activePollers = [];

  content.forEach((item, index) => {
    if (item === null || typeof item !== "object") return;
    const pollMs = item.PollIntervalMs;
    if (pollMs === undefined || pollMs === null) return;

    const basePath = `Content[${index}]`;
    const ptr = `/Content/${index}/PollIntervalMs`;
    const loc = getPositionForPath(pointers, ptr);

    if (typeof pollMs !== "number" || !Number.isFinite(pollMs)) {
      warnings.push({
        message: `PollIntervalMs of ${basePath} must be a number.`,
        path: `${basePath}.PollIntervalMs`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null,
      });
      return;
    }

    if (pollMs > 0 && pollMs < POLL_MIN_INTERVAL_MS) {
      warnings.push({
        message:
          `PollIntervalMs of ${basePath} (${pollMs}) is below the minimum threshold of ${POLL_MIN_INTERVAL_MS}ms — the client will not poll.`,
        path: `${basePath}.PollIntervalMs`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null,
      });
      return;
    }

    if (pollMs >= POLL_MIN_INTERVAL_MS) {
      const tx0 =
        Array.isArray(item.TxFormats) && item.TxFormats.length > 0
          ? String(item.TxFormats[0] ?? "").trim()
          : "";
      if (!tx0) {
        warnings.push({
          message:
            `PollIntervalMs of ${basePath} is enabled but TxFormats[0] is empty — polling will not send any command.`,
          path: `${basePath}.TxFormats`,
          line: loc ? loc.line : null,
          column: loc ? loc.column : null,
        });
      } else {
        activePollers.push({ pollMs, basePath });
      }
    }
  });

  if (activePollers.length > 1) {
    warnings.push({
      message:
        `Scenario has ${activePollers.length} blocks with PollIntervalMs enabled. Consider using one polling block with RxSourceBlockNo for gauge/chart to avoid serial overload.`,
      path: "Content",
      line: null,
      column: null,
    });
  }

  const aggregateHz = activePollers.reduce(
    (sum, p) => sum + 1000 / Math.max(p.pollMs, POLL_MIN_INTERVAL_MS),
    0
  );
  if (aggregateHz > MAX_AGGREGATE_POLL_HZ) {
    warnings.push({
      message:
        `Estimated aggregate poll rate ${aggregateHz.toFixed(1)} cmd/s (recommended ≤ ${MAX_AGGREGATE_POLL_HZ}/s). Increase PollIntervalMs or consolidate polling into one block.`,
      path: "Content",
      line: null,
      column: null,
    });
  }

  return warnings;
}

/**
 * Trích vị trí (line/column) từ thông báo lỗi SyntaxError của JSON.parse.
 * @param {string} raw - Chuỗi JSON gốc
 * @param {Error} err - Lỗi từ JSON.parse
 * @returns {{ line: number, column: number } | null}
 */
function getSyntaxErrorPosition(raw, err) {
  const msg = err && err.message;
  if (!msg) return null;
  const m = msg.match(/position\s+(\d+)/i);
  if (m) {
    const pos = parseInt(m[1], 10);
    return positionToLineColumn(raw, pos);
  }
  return null;
}

/**
 * Chuyển đường dẫn dạng "Content[2].Type" thành JSON pointer "/Content/2/Type".
 * @param {string} path - Đường dẫn kiểu Content[2].Type hoặc Name
 * @returns {string}
 */
function pathToJsonPointer(path) {
  if (!path) return "";
  return "/" + path
    .replace(/\./g, "/")
    .replace(/\[(\d+)\]/g, "/$1")
    .replace(/^\/+/, "");
}

/**
 * Lấy vị trí (dòng, cột) cho một đường dẫn từ bản đồ pointers của json-source-map.
 * pointers[ptr] có dạng { value: { line, column, pos }, valueEnd, key, keyEnd }.
 * Line/column trong thư viện là 0-based, trả về 1-based cho người dùng.
 * @param {object} pointers - pointers từ jsonMap.parse()
 * @param {string} jsonPointer - Ví dụ "/Content/2/Type"
 * @returns {{ line: number, column: number } | null}
 */
function getPositionForPath(pointers, jsonPointer) {
  const entry = pointers[jsonPointer];
  if (!entry || !entry.value) return null;
  const { line, column } = entry.value;
  return {
    line: typeof line === "number" ? line + 1 : 1,
    column: typeof column === "number" ? column + 1 : 1
  };
}

/**
 * Kiểm tra cấu trúc từng phần tử Content và thu thập lỗi/cảnh báo.
 * @param {Array} content - Mảng Content đã parse
 * @param {object} pointers - Bản đồ vị trí từ jsonMap.parse()
 * @returns {{ errors: Array<{message, path, line, column}>, warnings: Array }}
 */
function validateContentArray(content, pointers) {
  const errors = [];
  const warnings = [];

  if (!Array.isArray(content)) {
    return {
      errors: [{ message: '"Content" must be an array.', path: "Content", line: null, column: null }],
      warnings
    };
  }

  content.forEach((item, index) => {
    const basePath = `Content[${index}]`;
    const basePointer = `/Content/${index}`;

    if (item === null || typeof item !== "object") {
      const loc = getPositionForPath(pointers, basePointer);
      errors.push({
        message: `Element ${basePath} is not an object.`,
        path: basePath,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
      return;
    }

    // Type (bắt buộc, enum)
    if (item.Type === undefined || item.Type === null) {
      const ptr = `${basePointer}/Type`;
      const loc = getPositionForPath(pointers, ptr);
      errors.push({
        message: `Field "Type" of ${basePath} is missing or invalid.`,
        path: `${basePath}.Type`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
    } else if (typeof item.Type !== "string" || item.Type.trim() === "") {
      const ptr = `${basePointer}/Type`;
      const loc = getPositionForPath(pointers, ptr);
      errors.push({
        message: `Field "Type" of ${basePath} must be a non-empty string.`,
        path: `${basePath}.Type`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
    } else {
      const rawType = item.Type;
      const alias = CONTENT_TYPE_ALIASES[rawType];
      if (alias) {
        const ptr = `${basePointer}/Type`;
        const loc = getPositionForPath(pointers, ptr);
        warnings.push({
          message: DEPRECATED_TYPE_WARNINGS[rawType] || `Type "${rawType}" has been normalized to "${alias}".`,
          path: `${basePath}.Type`,
          line: loc ? loc.line : null,
          column: loc ? loc.column : null
        });
      } else if (!VALID_CONTENT_TYPES.includes(rawType)) {
        const ptr = `${basePointer}/Type`;
        const loc = getPositionForPath(pointers, ptr);
        const canonicalList = [...new Set([...VALID_CONTENT_TYPES, ...Object.keys(CONTENT_TYPE_ALIASES)])];
        errors.push({
          message: `"Type" of ${basePath} is invalid. Valid values: ${canonicalList.join(", ")}.`,
          path: `${basePath}.Type`,
          line: loc ? loc.line : null,
          column: loc ? loc.column : null
        });
      }
    }

    // Name (bắt buộc)
    if (item.Name === undefined || item.Name === null) {
      const ptr = `${basePointer}/Name`;
      const loc = getPositionForPath(pointers, ptr);
      errors.push({
        message: `Field "Name" of ${basePath} is missing.`,
        path: `${basePath}.Name`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
    } else if (typeof item.Name !== "string" || item.Name.trim() === "") {
      const ptr = `${basePointer}/Name`;
      const loc = getPositionForPath(pointers, ptr);
      errors.push({
        message: `Field "Name" of ${basePath} must be a non-empty string.`,
        path: `${basePath}.Name`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
    }

    // Labels: nên là mảng chuỗi
    if (item.Labels !== undefined && item.Labels !== null && !Array.isArray(item.Labels)) {
      const ptr = `${basePointer}/Labels`;
      const loc = getPositionForPath(pointers, ptr);
      warnings.push({
        message: `Field "Labels" of ${basePath} should be an array.`,
        path: `${basePath}.Labels`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
    }

    // TxFormats: nên là mảng chuỗi
    if (item.TxFormats !== undefined && item.TxFormats !== null && !Array.isArray(item.TxFormats)) {
      const ptr = `${basePointer}/TxFormats`;
      const loc = getPositionForPath(pointers, ptr);
      warnings.push({
        message: `Field "TxFormats" of ${basePath} should be an array.`,
        path: `${basePath}.TxFormats`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
    }

    // Params: null hoặc mảng đối tượng
    if (item.Params !== undefined && item.Params !== null && !Array.isArray(item.Params)) {
      const ptr = `${basePointer}/Params`;
      const loc = getPositionForPath(pointers, ptr);
      warnings.push({
        message: `Field "Params" of ${basePath} should be an array or null.`,
        path: `${basePath}.Params`,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      });
    }
  });

  warnings.push(...validatePollConfiguration(content, pointers));

  return { errors, warnings };
}

/**
 * Kiểm tra file JSON kịch bản (chuỗi thô) và trả về lỗi/cảnh báo kèm vị trí dòng, cột.
 * @param {string} rawJson - Nội dung file .json dạng chuỗi
 * @returns {{
 *   valid: boolean,
 *   errors: Array<{ message: string, path: string | null, line: number | null, column: number | null }>,
 *   warnings: Array<{ message: string, path: string | null, line: number | null, column: number | null }>
 * }}
 */
function validateScenarioFile(rawJson) {
  const errors = [];
  const warnings = [];

  if (typeof rawJson !== "string") {
    return {
      valid: false,
      errors: [{ message: "Input must be a JSON string (file content).", path: null, line: null, column: null }],
      warnings: []
    };
  }

  const trimmed = rawJson.trim();
  if (trimmed === "") {
    return {
      valid: false,
      errors: [{ message: "File is empty or has no content.", path: null, line: null, column: null }],
      warnings: []
    };
  }

  let data;
  let pointers = {};

  try {
    const parsed = jsonMap.parse(trimmed);
    data = parsed.data;
    pointers = parsed.pointers || {};
  } catch (parseErr) {
    const loc = getSyntaxErrorPosition(trimmed, parseErr);
    return {
      valid: false,
      errors: [{
        message: parseErr && parseErr.message ? parseErr.message : "JSON syntax error.",
        path: null,
        line: loc ? loc.line : null,
        column: loc ? loc.column : null
      }],
      warnings: []
    };
  }

  if (!data || typeof data !== "object") {
    const loc = getPositionForPath(pointers, "");
    return {
      valid: false,
      errors: [{
        message: "Root must be a JSON object.",
        path: null,
        line: loc ? loc.line : 1,
        column: loc ? loc.column : 1
      }],
      warnings: []
    };
  }

  // --- Root: Name (bắt buộc)
  if (!data.Name || typeof data.Name !== "string" || data.Name.trim() === "") {
    const ptr = "/Name";
    const loc = getPositionForPath(pointers, ptr);
    errors.push({
      message: 'Field "Name" (scenario name) is required and must be a non-empty string.',
      path: "Name",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  }

  // --- Description (tùy chọn, khuyến nghị)
  if (data.Description !== undefined && data.Description !== null && typeof data.Description !== "string") {
    const ptr = "/Description";
    const loc = getPositionForPath(pointers, ptr);
    warnings.push({
      message: 'Field "Description" should be a string.',
      path: "Description",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  }

  // --- Content (bắt buộc, mảng)
  if (data.Content === undefined || data.Content === null) {
    const ptr = "/Content";
    const loc = getPositionForPath(pointers, ptr);
    errors.push({
      message: 'Field "Content" (command block list) is required.',
      path: "Content",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  } else {
    const contentResult = validateContentArray(data.Content, pointers);
    errors.push(...contentResult.errors);
    warnings.push(...contentResult.warnings);
  }

  // --- Banners (tùy chọn): nên là mảng chuỗi
  if (data.Banners !== undefined && data.Banners !== null && !Array.isArray(data.Banners)) {
    const ptr = "/Banners";
    const loc = getPositionForPath(pointers, ptr);
    warnings.push({
      message: 'Field "Banners" should be an array of strings.',
      path: "Banners",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  }

  // --- Baudrate, Parity, StopBits, DataBits, NewLine, FlowControl: kiểu đúng
  if (data.Baudrate !== undefined && data.Baudrate !== null && typeof data.Baudrate !== "number") {
    const ptr = "/Baudrate";
    const loc = getPositionForPath(pointers, ptr);
    warnings.push({
      message: 'Field "Baudrate" should be a number.',
      path: "Baudrate",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  }

  const validParities = ["none", "even", "odd", "mark", "space"];
  if (data.Parity !== undefined && data.Parity !== null && typeof data.Parity === "string" && !validParities.includes(data.Parity.toLowerCase())) {
    const ptr = "/Parity";
    const loc = getPositionForPath(pointers, ptr);
    warnings.push({
      message: `Field "Parity" should be one of: ${validParities.join(", ")}.`,
      path: "Parity",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  }

  const validStopBits = [1, 1.5, 2];
  if (data.StopBits !== undefined && data.StopBits !== null && !validStopBits.includes(data.StopBits)) {
    const ptr = "/StopBits";
    const loc = getPositionForPath(pointers, ptr);
    warnings.push({
      message: `Field "StopBits" should be 1, 1.5, or 2.`,
      path: "StopBits",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  }

  if (data.DataBits !== undefined && data.DataBits !== null && (typeof data.DataBits !== "number" || (data.DataBits !== 7 && data.DataBits !== 8))) {
    const ptr = "/DataBits";
    const loc = getPositionForPath(pointers, ptr);
    warnings.push({
      message: 'Field "DataBits" should be 7 or 8.',
      path: "DataBits",
      line: loc ? loc.line : null,
      column: loc ? loc.column : null
    });
  }

  // --- Flow (tùy chọn): đồ thị luồng 2D
  if (data.Flow !== undefined && data.Flow !== null) {
    const contentArr = Array.isArray(data.Content) ? data.Content : [];
    const flowResult = validateScenarioFlow(data.Flow, contentArr);
    errors.push(...flowResult.errors);
    warnings.push(...flowResult.warnings);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

module.exports = {
  validateScenarioFile,
  VALID_CONTENT_TYPES,
  positionToLineColumn,
  getSyntaxErrorPosition
};
