const configService = require("../services/configService");

exports.importConfig = async (req, res) => {
    try {
        const userId = req.user.id;
        const configData = req.body;

        const newConfig = await configService.importConfig(userId, configData);
        res.status(201).json({ message: "Import thành công", data: newConfig });
    } catch (error) {
        console.error("Import thất bại:", error);
        res.status(500).json({ message: "Lỗi import cấu hình", error: error.message });
    }
};
exports.getConfigById = async (req, res) => {
    try {
        const id = req.params.id;
        const config = await configService.getConfigById(id);
        res.json(config);
    } catch (error) {
        res.status(error.statusCode || 500).json({
            message: error.message || "Lỗi server",
        });
    }
};

exports.shareConfig = async (req, res) => {
    const { configId } = req.params;
    const userId = req.user.id; // Lấy từ middleware xác thực JWT

    try {
        const sharedConfig = await configService.shareConfig(configId, userId);
        res.status(200).json({
            message: "Đã chia sẻ cấu hình.",
            shareCode: sharedConfig.shareCode
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * Lấy mã chia sẻ của 1 cấu hình nào đó
 * @alias /share/:shareCode
 * @param {*} req  gói tin request
 * @param {*} res  gói tin response
 */
exports.getSharedConfig = async (req, res) => {
    const { shareCode } = req.params;
    try {
        const config = await configService.getSharedConfig(shareCode);
        res.status(200).json(config);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

/**
 * Xóa cấu hình đã lưu
 * @param {*} req  gói tin request
 * @param {*} res  gói tin response
 */
exports.exportConfig = async (req, res) => {
  const { configId } = req.params;
  const userId = req.user.id;

  try {
    const config = await configService.exportConfig(configId, userId);
    res.status(200).json(config);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

/**
 * Lấy cấu hình serial dựa trên id
 * @alias  /myconfigs2
 * @param {*} req  gói tin request
 * @param {*} res  gói tin response
 */
exports.getConfigsByUserId = async (req, res) => {
  const userId = req.user.id;

  try {
    const configs = await configService.getConfigsByUserId(userId);
    res.status(200).json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


/**
 * Xóa cấu hình đã lưu
 * @param {*} req  gói tin request
 * @param {*} res  gói tin response
 */
exports.deleteConfig = async (req, res) => {
  const { configId } = req.params;
  const userId = req.user.id;

  try {
    await configService.deleteConfig(configId, userId);
    res.status(200).json({ message: "Xoá thành công." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
