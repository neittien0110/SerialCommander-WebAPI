/**
 * Validation/normalization của payload kịch bản — dùng chung bởi createScenario,
 * updateScenario, và endpoint /verify (public) để đảm bảo nhất quán contract.
 */

function contentInputToArray(content) {
  if (Array.isArray(content)) return content;
  if (content == null || content === "") return null;
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function sanitizeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function normalizeScenarioPayload(scenarioData) {
  const errors = [];
  const name = sanitizeString(scenarioData?.Name);
  if (!name) {
    errors.push('Trường "Name" là bắt buộc.');
  }

  const contentArr = contentInputToArray(scenarioData?.Content);
  if (!contentArr) {
    errors.push('Trường "Content" phải là JSON array hợp lệ.');
  }

  const parity = scenarioData?.Parity == null ? "none" : String(scenarioData.Parity).toLowerCase();
  if (!["none", "even", "odd", "mark", "space"].includes(parity)) {
    errors.push('Trường "Parity" không hợp lệ.');
  }

  const stopBits = scenarioData?.StopBits == null ? 1 : Number(scenarioData.StopBits);
  if (![1, 2].includes(stopBits)) {
    errors.push('Trường "StopBits" chỉ chấp nhận 1 hoặc 2.');
  }

  const dataBits = scenarioData?.DataBits == null ? 8 : Number(scenarioData.DataBits);
  if (![7, 8].includes(dataBits)) {
    errors.push('Trường "DataBits" chỉ chấp nhận 7 hoặc 8.');
  }

  const flowControl = scenarioData?.FlowControl == null ? "none" : String(scenarioData.FlowControl).toLowerCase();
  if (!["none", "hardware"].includes(flowControl)) {
    errors.push('Trường "FlowControl" chỉ chấp nhận "none" hoặc "hardware".');
  }

  const newLineRaw = scenarioData?.NewLine == null ? "none" : String(scenarioData.NewLine);
  const newLineNormalized = newLineRaw.toUpperCase() === "NONE" ? "none" : newLineRaw.toUpperCase();
  if (!["none", "CRLF", "CR", "LF"].includes(newLineNormalized)) {
    errors.push('Trường "NewLine" chỉ chấp nhận "none", "CRLF", "CR" hoặc "LF".');
  }

  const baudrate = scenarioData?.Baudrate == null ? null : Number(scenarioData.Baudrate);
  if (baudrate != null && (!Number.isInteger(baudrate) || baudrate <= 0)) {
    errors.push('Trường "Baudrate" phải là số nguyên dương.');
  }

  const guideRaw = scenarioData?.Guide;
  const guide = typeof guideRaw === "string" ? guideRaw.trim() : "";
  if (guide.length > 10000) {
    errors.push('Trường "Guide" không được vượt quá 10000 ký tự.');
  }

  if (errors.length > 0) {
    const error = new Error(errors.join(" "));
    error.statusCode = 400;
    throw error;
  }

  return {
    Name: name,
    Description: sanitizeString(scenarioData?.Description, ""),
    Guide: guide,
    Baudrate: baudrate,
    Parity: parity,
    StopBits: stopBits,
    DataBits: dataBits,
    FlowControl: flowControl,
    NewLine: newLineNormalized,
    Banners: Array.isArray(scenarioData?.Banners) ? scenarioData.Banners : [],
    Banner1: scenarioData?.Banner1 ?? null,
    Banner2: scenarioData?.Banner2 ?? null,
    Content: contentArr,
  };
}

/**
 * Verifies if the scenario data is valid — dùng cùng normalizeScenarioPayload để đảm bảo
 * contract nhất quán giữa /verify (public) và createScenario/updateScenario.
 *
 * @param {object} scenarioData - The scenario data to validate.
 * @returns {object} { data, errors, warnings }
 */
function verifyScenario(scenarioData) {
  const warnings = [];

  if (!scenarioData || typeof scenarioData !== "object") {
    return { data: null, errors: ["Dữ liệu kịch bản không hợp lệ hoặc bị thiếu."], warnings };
  }

  // Gợi ý không bắt buộc
  if (!scenarioData.Description || String(scenarioData.Description).trim() === "") {
    warnings.push('Trường "Description" giúp giải thích rõ hơn về kịch bản.');
  }

  // Kiểm tra cấu trúc Content items nếu có
  const rawContent = scenarioData.Content;
  if (rawContent) {
    try {
      const arr = Array.isArray(rawContent) ? rawContent : JSON.parse(rawContent);
      if (Array.isArray(arr)) {
        arr.forEach((item, index) => {
          if (typeof item !== "object" || item === null) return;
          if (item.List !== null && item.List !== undefined && typeof item.List !== "string") {
            warnings.push(`Trường List của Content[${index}] nên là chuỗi hoặc null.`);
          }
          if (item.DefaultValue !== null && item.DefaultValue !== undefined && typeof item.DefaultValue !== "string") {
            warnings.push(`Trường DefaultValue của Content[${index}] nên là chuỗi hoặc null.`);
          }
        });
      }
    } catch {
      // Lỗi parse sẽ được báo bởi normalizeScenarioPayload bên dưới
    }
  }

  // Dùng cùng logic validate/normalize với createScenario để đảm bảo nhất quán
  try {
    const normalized = normalizeScenarioPayload(scenarioData);
    return { data: normalized, errors: [], warnings };
  } catch (err) {
    return { data: null, errors: [err.message || String(err)], warnings };
  }
}

module.exports = {
  contentInputToArray,
  sanitizeString,
  normalizeScenarioPayload,
  verifyScenario,
};
