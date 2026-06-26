/**
 * Logic chia sẻ kịch bản qua mã ShareCode công khai.
 */
const { Scenario } = require("../../../models");
const { v4: uuidv4 } = require("uuid");
const { attachScenarioContent } = require("./scenarioContentMapper");

/**
 * Creates a new share code.
 * @returns {string} The generated share code.
 */
function generateShareCode() {
  return uuidv4().replace(/-/g, "").slice(0, 12);
}

/**
 * Kích hoat hoặc Ngừng quá trình chia sẻ cấu hình
 * @param {string} id - The ID of the scenario.
 * @param {string} userId - The ID of the user who owns the scenario.
 * @returns {Promise<object>} A promise that resolves to the updated scenario object with a share code.
 */
async function shareScenario(id, userId) {
  const scenario = await Scenario.findOne({
    where: { Id: id, UserId: userId }
  });
  if (!scenario) {
    const error = new Error("Không tìm thấy kịch bản hoặc không có quyền.");
    error.statusCode = 404;
    throw error;
  }
  scenario.IsShared = !scenario.IsShared;
  if (scenario.IsShared) {
    let assigned = false;
    for (let i = 0; i < 5; i += 1) {
      try {
        scenario.ShareCode = generateShareCode();
        await scenario.save();
        assigned = true;
        break;
      } catch (error) {
        if (error.name !== "SequelizeUniqueConstraintError" && error.original?.code !== "ER_DUP_ENTRY") {
          throw error;
        }
      }
    }
    if (!assigned) {
      const error = new Error("Không thể tạo mã chia sẻ duy nhất. Vui lòng thử lại.");
      error.statusCode = 503;
      throw error;
    }
    return scenario;
  }
  await scenario.save();
  return scenario;
}

/**
 * Kiểm tra mã chia sẻ có tồn tại và đang bật IsShared (không tải Content).
 * @param {string} shareCode
 * @returns {Promise<boolean>}
 */
async function isShareCodeAvailable(shareCode) {
  const row = await Scenario.findOne({
    where: { ShareCode: shareCode, IsShared: true },
    attributes: ["Id"],
  });
  return !!row;
}

/**
 * Retrieves a scenario by its share code.
 * @param {string} shareCode - The share code of the scenario.
 * @returns {Promise<object>} A promise that resolves to the shared scenario object.
 */
async function getScenarioByShareCode(shareCode) {
  const scenario = await Scenario.findOne({
    where: { ShareCode: shareCode, IsShared: true },
    attributes: [
      "Id",
      "Name",
      "Description",
      "Guide",
      "FeatureImage",
      "IsShared",
      "ShareCode",
      "Baudrate",
      "DataBits",
      "Parity",
      "StopBits",
      "NewLine",
      "FlowControl",
      "Banner1",
      "Banner2",
      "Content",
    ],
  });
  if (!scenario) {
    const error = new Error(`Không tìm thấy kịch bản chia sẻ với mã ${shareCode}.`);
    error.statusCode = 404;
    throw error;
  }
  const enriched = await attachScenarioContent(scenario);
  return { dataValues: enriched };
}

module.exports = {
  generateShareCode,
  shareScenario,
  isShareCodeAvailable,
  getScenarioByShareCode,
};
