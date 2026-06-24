/**
 * CRUD / truy vấn dữ liệu cho Scenario (MySQL là source of truth).
 */
const { Scenario, User, sequelize } = require("../../../models");
const { Op } = require("sequelize");
const { logError } = require("../../../kernels/logging/appLogger");
const scenarioFirestore = require("./scenarioFirestoreService");
const scenarioSyncStatus = require("../../../kernels/scenarioSyncStatus");
const { normalizeScenarioPayload } = require("./scenarioValidation");
const {
  toPlainRecord,
  attachScenarioContent,
  attachScenarioContentFromMap,
  applySyncStatus,
} = require("./scenarioContentMapper");
const { enqueueAfterCommit } = require("./scenarioSyncHelper");

/**
 * Creates a new scenario for a specific user.
 * @param {string} userId - The ID of the user creating the scenario.
 * @param {object} scenarioData - The data for the new scenario.
 * @returns {Promise<object>} A promise that resolves to the created scenario object.
 */
async function createScenario(userId, scenarioData) {
  const normalized = normalizeScenarioPayload(scenarioData);
  const banners = normalized.Banners;
  const tx = await sequelize.transaction();
  let newScenario;
  try {
    newScenario = await Scenario.create(
      {
        Name: normalized.Name,
        Description: normalized.Description,
        Guide: normalized.Guide || null,
        UserId: userId,
        Baudrate: normalized.Baudrate,
        Parity: normalized.Parity,
        StopBits: normalized.StopBits,
        DataBits: normalized.DataBits,
        FlowControl: normalized.FlowControl,
        NewLine: normalized.NewLine,
        Banner1: banners[0] ?? normalized.Banner1 ?? null,
        Banner2: banners[1] ?? normalized.Banner2 ?? null,
        Content: JSON.stringify(normalized.Content),
      },
      { transaction: tx }
    );
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    logError("createScenario failed", {
      userId,
      message: error.message || String(error),
      code: error.code,
      statusCode: error.statusCode || error.status,
    });
    throw error;
  }

  const syncStatus = await enqueueAfterCommit("scenario_upsert", newScenario.Id, {
    content: normalized.Content,
  });

  const plain = toPlainRecord(newScenario);
  plain.Content = JSON.stringify(normalized.Content);
  plain.syncStatus = syncStatus;
  return plain;
}

/**
 * Tìm kịch bản dựa trên tham số
 * @param {string} id - ID của kịch bản
 * @param {string} userId - Id của người sở hữu
 * @returns {Promise<object>} Toàn bộ bản ghi về Kịch bản trong DB
 */
async function getScenarioById(id, userId) {
  const scenario = await Scenario.findOne({
    where: { Id: id, UserId: userId },
  });
  if (!scenario) {
    const error = new Error("Không tìm thấy kịch bản hoặc không có quyền truy cập.");
    error.statusCode = 404;
    throw error;
  }
  return attachScenarioContent(scenario);
}

/**
 * Updates an existing scenario.
 * @param {string} scenarioId - The ID of the scenario to update.
 * @param {string} userId - The ID of the user who owns the scenario.
 * @param {object} updateData - The data to update the scenario with.
 * @returns {Promise<number>} A promise that resolves to the number of updated rows.
 */
async function updateScenario(scenarioId, userId, updateData) {
  const normalized = normalizeScenarioPayload(updateData);
  const banners = normalized.Banners;
  const existing = await Scenario.findOne({ where: { Id: scenarioId, UserId: userId } });
  if (!existing) {
    const error = new Error("Không tìm thấy kịch bản để cập nhật hoặc không có quyền.");
    error.statusCode = 404;
    throw error;
  }

  const nextValues = {
    Name: normalized.Name,
    Description: normalized.Description,
    Guide: normalized.Guide || null,
    UserId: userId,
    Baudrate: normalized.Baudrate,
    Parity: normalized.Parity,
    StopBits: normalized.StopBits,
    DataBits: normalized.DataBits,
    FlowControl: normalized.FlowControl,
    NewLine: normalized.NewLine,
    Banner1: banners[0] ?? normalized.Banner1 ?? null,
    Banner2: banners[1] ?? normalized.Banner2 ?? null,
    Content: JSON.stringify(normalized.Content),
  };

  const tx = await sequelize.transaction();
  try {
    await Scenario.update(nextValues, {
      where: { Id: scenarioId, UserId: userId },
      transaction: tx,
    });
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  const syncStatus = await enqueueAfterCommit("scenario_upsert", scenarioId, {
    content: normalized.Content,
  });

  return { updatedRows: 1, syncStatus };
}

/**
 * Xóa một kịch bản
 * @param {string} id - The ID of the scenario to delete.
 * @param {string} userId - The ID of the user who owns the scenario.
 * @returns {Promise<number>} A promise that resolves to the number of deleted rows.
 */
async function deleteScenario(id, userId) {
  const tx = await sequelize.transaction();
  let deletedRows = 0;
  try {
    deletedRows = await Scenario.destroy({
      where: { Id: id, UserId: userId },
      transaction: tx,
    });
    if (deletedRows === 0) {
      const error = new Error("Không tìm thấy kịch bản để xóa hoặc không có quyền.");
      error.statusCode = 404;
      throw error;
    }
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  }

  const syncStatus = await enqueueAfterCommit("scenario_delete", id, null);

  return { deletedRows, syncStatus };
}

/**
 * Retrieves all scenarios belonging to a specific user.
 * @param {string} userId
 * @param {{ limit?: number, offset?: number }} [options]
 * @returns {Promise<{ scenarios: Array<object>, total: number, limit: number, offset: number }>}
 */
async function getScenariosByUserId(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);

  const { rows, count } = await Scenario.findAndCountAll({
    where: { UserId: userId },
    order: [["CreatedAt", "DESC"]],
    limit,
    offset,
  });

  const ids = rows.map((row) => toPlainRecord(row)?.Id).filter(Boolean);
  const [contentMap, statusMap] = await Promise.all([
    scenarioFirestore.batchGetScenarioContentArrays(ids),
    scenarioSyncStatus.getScenarioSyncStatusBatch(ids),
  ]);
  const scenarios = rows
    .map((row) => applySyncStatus(attachScenarioContentFromMap(row, contentMap), statusMap))
    .filter(Boolean);

  return { scenarios, total: count, limit, offset };
}

/**
 * Danh sách scenario công khai (IsShared=1), lọc theo tên (tuỳ chọn), phân trang.
 * Không trả Content/UserId — tránh lộ dữ liệu riêng tư trên trang khám phá.
 * @param {{ search?: string, limit?: number, offset?: number }} options
 */
const PUBLIC_SORT_MAP = {
  newest:   [["ModifiedAt", "DESC"]],
  oldest:   [["ModifiedAt", "ASC"]],
  name_asc: [["Name", "ASC"]],
};
const PUBLIC_SCENARIO_SORT_KEYS = Object.keys(PUBLIC_SORT_MAP);

async function getPublicScenarios(options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
  const offset = Math.max(Number(options.offset) || 0, 0);
  const search = typeof options.search === "string" ? options.search.trim() : "";
  const order = PUBLIC_SORT_MAP[options.sort] ?? PUBLIC_SORT_MAP.newest;

  const where = { IsShared: true };
  if (search) {
    where.Name = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await Scenario.findAndCountAll({
    where,
    attributes: ["Id", "Name", "Description", "ShareCode", "ModifiedAt"],
    include: [{ model: User, as: "User", attributes: ["username"], required: false }],
    order,
    limit,
    offset,
  });

  const scenarios = rows.map((row) => {
    const plain = toPlainRecord(row);
    plain.SharedByUsername = row.User?.username ?? null;
    delete plain.User;
    return plain;
  });
  return { scenarios, total: count, limit, offset };
}

module.exports = {
  createScenario,
  getScenarioById,
  updateScenario,
  deleteScenario,
  getScenariosByUserId,
  getPublicScenarios,
  PUBLIC_SCENARIO_SORT_KEYS,
};
