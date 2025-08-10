const configService = require("../services/configService");

exports.importScenario = async (req, res) => {
    try {
        const userId = req.user.id;
        const configData = req.body;

        const newConfig = await configService.importScenario(userId, configData);
        res.status(201).json({ message: "Import thành công", data: newConfig });
    } catch (error) {
        console.error("Import thất bại:", error);
        res.status(500).json({ message: "Lỗi import cấu hình", error: error.message });
    }
};

/**
 * Lấy cấu hình thông qua id định danh của nó
 * @alias /config/:id
 * @param {*} req  gói tin request
 * @param {*} res  gói tin response
 */
exports.getScenarioById = async (req, res) => {
    try {
        const id = req.params.id;
        const config = await configService.getScenarioById(id);
        res.json(config);
    } catch (error) {
        res.status(error.statusCode || 500).json({
            message: error.message || "Lỗi server",
        });
    }
};

exports.shareConfig = async (req, res) => {
    const { scenarioId } = req.params;
    const userId = req.user.id; // Lấy từ middleware xác thực JWT

    try {
        const sharedConfig = await configService.shareConfig(scenarioId, userId);
        res.status(200).json({
            message: "Đã chia sẻ cấu hình.",
            shareCode: sharedConfig.shareCode
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};


/**
 * Lấy cấu hình thông qua mã chia sẻ của nó
 * @alias /share/:shareCode
 * @param {*} req  gói tin request
 * @param {*} res  gói tin response
 */
exports.getScenarioByShareCode = async (req, res) => {
    const { shareCode } = req.params;
    try {
        if (shareCode == "0") shareCode = "00000"; //Mặc định
        const config = await configService.getScenarioByShareCode(shareCode);
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
exports.exportScenario = async (req, res) => {
  const { scenarioId } = req.params;
  const userId = req.user.id;

  try {
    const config = await configService.exportScenario(scenarioId, userId);
    res.status(200).json(config);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

/**
 * Lấy cấu hình serial dựa trên id
 * @alias  /myscenarios
 * @param {*} req  gói tin request
 * @param {*} res  gói tin response
 */
exports.getScenariosByUserId = async (req, res) => {
  const userId = req.user.id;

  try {
    const configs = await configService.getScenariosByUserId(userId);
    console.log("ahaha");
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
  const { scenarioId } = req.params;
  const userId = req.user.id;

  try {
    await configService.deleteConfig(scenarioId, userId);
    res.status(200).json({ message: "Xoá thành công." });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
