/**
 * Khởi động tất cả background jobs của server.
 * Gọi duy nhất một lần sau khi app.listen() thành công.
 */
const { startAuthCodeCleanupJob } = require("../kernels/jobs/authCodeCleanupJob");
const { startScenarioOutboxWorker } = require("../kernels/syncJob");
const { startMqttPasswdCleanupJob } = require("../kernels/jobs/mqttPasswdCleanupJob");
const { startScenarioDraftShareCleanupJob } = require("../kernels/jobs/scenarioDraftShareCleanupJob");

function startAllJobs() {
  startAuthCodeCleanupJob();
  startScenarioOutboxWorker();
  startMqttPasswdCleanupJob();
  startScenarioDraftShareCleanupJob();
}

module.exports = { startAllJobs };
