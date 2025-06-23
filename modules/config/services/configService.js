const { DeviceConfig } = require("../../../models");
const { Component } = require("../../../models");
const { User } = require("../../../models");
const { v4: uuidv4 } = require("uuid");

exports.importConfig = async (userId, configData) => {
    const {
        name,
        delayTime,
        description,
        baudrate,
        leftBanner,
        rightBanner,
        isShared = false,
        shareCode = null,
        components = [],
    } = configData;

    const newConfig = await DeviceConfig.create({
        name,
        delayTime,
        description,
        baudrate,
        leftBanner,
        rightBanner,
        isShared,
        shareCode,
        userId,
    });

    const componentList = components.map((c) => ({
        name: c.name,
        type: c.type,
        list: c.list || null,
        defaultValue: c.defaultValue || null,
        configId: newConfig.id,
    }));

    await Component.bulkCreate(componentList);

    return {
        config: newConfig,
        components: componentList,
    };
};

exports.getConfigById = async (id) => {
    const config = await DeviceConfig.findOne({
        where: { id },
        include: [{ model: Component, as: "components" }],
    });

    if (!config) {
        const error = new Error("Không tìm thấy cấu hình");
        error.statusCode = 404;
        throw error;
    }

    return config;
};

exports.shareConfig = async (configId, userId) => {
    const config = await DeviceConfig.findOne({ where: { id: configId, userId } });
    if (!config) throw new Error("Không tìm thấy cấu hình hoặc không có quyền.");

    config.isShared = true;
    config.shareCode = uuidv4().slice(0, 6); 
    await config.save();
    return config;
};

exports.getSharedConfig = async (shareCode) => {
    const config = await DeviceConfig.findOne({
        where: { shareCode, isShared: true },
        include: [{ model: Component, as: "components" }]
    });
    if (!config) throw new Error("Không tìm thấy cấu hình chia sẻ.");
    return config;
};

exports.exportConfig = async (configId, userId) => {
  const config = await DeviceConfig.findOne({
    where: { id: configId, userId },
    include: [{ model: Component, as: "components" }]
  });
  if (!config) throw new Error("Không tìm thấy cấu hình để export.");
  return config;
};

exports.getConfigsByUserId = async (userId) => {
  const configs = await DeviceConfig.findAll({
    where: { userId },
    include: [{ model: Component, as: "components" }],
    order: [["createdAt", "DESC"]]
  });

  return configs;
};

exports.deleteConfig = async (configId, userId) => {
  const config = await DeviceConfig.findOne({ where: { id: configId, userId } });
  if (!config) throw new Error("Không tìm thấy cấu hình hoặc không có quyền.");
  await config.destroy();
  return true;
};
