const { DeviceConfig } = require("../../../models");

exports.getSharedConfigs = async () => {
  return await DeviceConfig.findAll({ where: { isShared: true } });
};

exports.deleteSharedConfig = async (id) => {
  const config = await DeviceConfig.findByPk(id);
  if (!config || !config.isShared) {
    throw new Error("Không tìm thấy cấu hình chia sẻ");
  }
  await config.destroy();
  return config;
};
// duyệt cấu hình nếu cần 
exports.approveSharedConfig = async (id) => {
  const config = await DeviceConfig.findByPk(id);
  if (!config) {
    throw new Error("Không tìm thấy cấu hình");
  }
  await config.update({ isApproved: true });
  return config;
};
