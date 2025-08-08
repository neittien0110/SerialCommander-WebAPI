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

/**
 * Tạo mã ngẫu nhiên để share cấu hình
 * @returns 
 */
function GenerateShareCode() {
    return uuidv4().slice(0, 4);
}

/**
 * Tạo mã ngẫu nhiên để share phiên làm việc
 * @returns 
 */
function GenerateShareCode() {
    return uuidv4().slice(0, 5);
}

/**
 * Lấy mã share của 1 cấu hình, tự động tạo mới nếu chưa có
 * @param {*} configId  Cấu hình cần lấy
 * @param {*} ownerId   Tài khoản sở hữu
 * @returns 
 */
exports.shareConfig = async (configId, ownerId) => {
    const config = await DeviceConfig.findOne({ where: { id: configId, userId: ownerId } });
    if (config == null) {
      throw new Error("Không tìm thấy cấu hình hoặc không có quyền.");
    }
    // Nếu chưa chia sẻ thì hãy chia sẻ. còn nếu đã chia sẻ thì cứ thể trả về nội dung
    if (!config.isShared) {
      config.isShared = true;
      // Nếu đã có mã thì tái sử dụng lại
      if (config.shareCode == null || config.shareCode == "" ) {
        config.shareCode = GenerateShareCode();
      }
      await config.save();
    } 
    return config;
};

/**
 * Lấy cấu hình thông qua mã chia sẻ 
 */ 
exports.getConfigByShareCode = async (shareCode) => {
    const config = await DeviceConfig.findOne({
        where: { shareCode, isShared: true },
        include: [{ model: Component, as: "components" }]
    });
    if (config == null) {
      throw new Error(`Không tìm thấy cấu hình chia sẻ có mã ${shareCode}.`);
    }    
    // Nếu chưa chia sẻ thì hãy chia sẻ. còn nếu đã chia sẻ thì cứ thể trả về nội dung
    if (!config.isShared) {
      throw new Error(`Cấu hình tồn tại nhưng đã không còn chia sẻ với mã ${shareCode}.`);
    }     
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
  // Tìm config theo id + user
  const config = await DeviceConfig.findOne({
    where: { id: configId, userId },
  });
  if (!config) {
    throw new Error("Không tìm thấy cấu hình hoặc không có quyền.");
  }
  // Xoá toàn bộ components thuộc cấu hình
  await Component.destroy({
    where: { configId: config.id }
  });
  // Xoá cấu hình chính
  await config.destroy();
  return { message: "Đã xoá cấu hình và các thành phần liên quan." };
};

