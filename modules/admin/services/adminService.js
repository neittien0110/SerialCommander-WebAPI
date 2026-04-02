const { Scenario } = require("../../../models");

exports.getSharedConfigs = async () => {
  return await Scenario.findAll({ where: { IsShared: true } });
};

exports.deleteSharedConfig = async (id) => {
  const config = await Scenario.findByPk(id);
  if (!config || !config.IsShared) {
    throw new Error("Không tìm thấy cấu hình chia sẻ");
  }
  await config.destroy();
  return config;
};
exports.approveSharedConfig = async (id) => {
  const config = await Scenario.findByPk(id);
  if (!config) {
    throw new Error("Không tìm thấy cấu hình");
  }
  await config.update({ IsShared: true });
  return config;
};
