const { v4: uuidv4 } = require("uuid");
const { Op } = require("sequelize");
const { ScenarioDraftShare } = require("../../../models");

const DEFAULT_TTL_DAYS = 30;

function ttlDays() {
  const days = Number(process.env.DRAFT_SHARE_TTL_DAYS);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_TTL_DAYS;
}

function generateDraftShareCode() {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

/**
 * Lưu tạm 1 draft Studio (JSON string) khi nó quá lớn để encode trực tiếp vào URL.
 * @param {string} content JSON string của draft (đã JSON.stringify ở phía caller).
 * @returns {Promise<{ code: string, expiresAt: Date }>}
 */
exports.createDraftShare = async (content) => {
  const expiresAt = new Date(Date.now() + ttlDays() * 24 * 60 * 60 * 1000);
  let assigned = null;
  for (let i = 0; i < 5; i += 1) {
    try {
      const code = generateDraftShareCode();
      await ScenarioDraftShare.create({ Code: code, Content: content, ExpiresAt: expiresAt });
      assigned = code;
      break;
    } catch (error) {
      if (error.name !== "SequelizeUniqueConstraintError" && error.original?.code !== "ER_DUP_ENTRY") {
        throw error;
      }
    }
  }
  if (!assigned) {
    const error = new Error("Không thể tạo mã lưu tạm. Vui lòng thử lại.");
    error.statusCode = 503;
    throw error;
  }
  return { code: assigned, expiresAt };
};

/**
 * Đọc draft đã lưu tạm theo code. Hết hạn → xoá lazy + 404.
 * @param {string} code
 * @returns {Promise<string>} Content JSON string gốc.
 */
exports.getDraftShareContent = async (code) => {
  const row = await ScenarioDraftShare.findOne({ where: { Code: code } });
  if (!row) {
    const error = new Error("Không tìm thấy bản lưu tạm hoặc đã hết hạn.");
    error.statusCode = 404;
    throw error;
  }
  if (row.ExpiresAt.getTime() < Date.now()) {
    await row.destroy();
    const error = new Error("Không tìm thấy bản lưu tạm hoặc đã hết hạn.");
    error.statusCode = 404;
    throw error;
  }
  return row.Content;
};

/**
 * Xoá toàn bộ bản ghi hết hạn — dùng bởi cleanup job.
 * @returns {Promise<number>} Số bản ghi đã xoá.
 */
exports.cleanupExpiredDraftShares = async () => {
  return ScenarioDraftShare.destroy({ where: { ExpiresAt: { [Op.lt]: new Date() } } });
};
