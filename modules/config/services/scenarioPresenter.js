/** Đọc mảng Banners từ cột JSON mới; trả null nếu rỗng/không hợp lệ để fallback. */
function parseBannersColumn(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.filter((x) => typeof x === "string");
  } catch {
    return null;
  }
}

function mapScenarioOutput(record) {
  // Cột Banners (JSON, không giới hạn số dòng) là nguồn chính; kịch bản cũ chưa có
  // cột này thì dựng lại từ Banner1/Banner2 (issue #10).
  const fromColumn = parseBannersColumn(record.Banners);
  const banners = fromColumn ?? [record.Banner1, record.Banner2].filter(Boolean);
  const { Banner1, Banner2, Banners, ...rest } = record;
  return { ...rest, Banners: banners };
}

function mapScenarioFromMaybeDataValues(raw) {
  const record = raw?.dataValues ?? raw;
  return mapScenarioOutput(record);
}

function mapScenarioForExport(record) {
  let parsedContent;
  try {
    parsedContent = JSON.parse(record.Content);
  } catch {
    parsedContent = [];
  }
  return { ...mapScenarioOutput(record), Content: parsedContent };
}

module.exports = {
  mapScenarioOutput,
  mapScenarioFromMaybeDataValues,
  mapScenarioForExport,
};
