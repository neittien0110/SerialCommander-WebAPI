/**
 * Barrel: scenarioService gộp các module con theo trách nhiệm để giữ nguyên
 * public API cho mọi caller hiện có (scenarioController, tests, ...).
 *
 *  - scenarioValidation.js     validate/normalize payload + verifyScenario
 *  - scenarioContentMapper.js  gắn Content (Firestore) + syncStatus vào record
 *  - scenarioSyncHelper.js     enqueue đồng bộ Firestore sau khi MySQL commit
 *  - scenarioCrud.js           CRUD + truy vấn Scenario (MySQL)
 *  - scenarioSharing.js        chia sẻ kịch bản qua ShareCode
 */
const { verifyScenario } = require("./scenarioValidation");
const {
  createScenario,
  getScenarioById,
  updateScenario,
  deleteScenario,
  getScenariosByUserId,
  getPublicScenarios,
  PUBLIC_SCENARIO_SORT_KEYS,
} = require("./scenarioCrud");
const {
  shareScenario,
  isShareCodeAvailable,
  getScenarioByShareCode,
} = require("./scenarioSharing");

exports.verifyScenario = verifyScenario;
exports.createScenario = createScenario;
exports.getScenarioById = getScenarioById;
exports.updateScenario = updateScenario;
exports.deleteScenario = deleteScenario;
exports.getScenariosByUserId = getScenariosByUserId;
exports.getPublicScenarios = getPublicScenarios;
exports.PUBLIC_SCENARIO_SORT_KEYS = PUBLIC_SCENARIO_SORT_KEYS;
exports.shareScenario = shareScenario;
exports.isShareCodeAvailable = isShareCodeAvailable;
exports.getScenarioByShareCode = getScenarioByShareCode;
