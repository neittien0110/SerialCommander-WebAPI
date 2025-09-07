const scenarioService = require("../services/scenarioService");

/**
 * Creates a new scenario for the authenticated user.
 * @alias /scenarios/import
 */
exports.createScenario = async (req, res) => {
  const userId = req.user.id;
  try {
    const newScenario = await scenarioService.createScenario(userId, req.body);
    console.log(newScenario);
    res.status(201).json({ message: "Tạo kịch bản thành công.", scenario: newScenario });
  } catch (error) {
    console.error("Lỗi khi tạo kịch bản:", error);
    res.status(500).json({ error: error.message });
  }
};


/**
 * Kiểm tra tính hợp lệ của 1 kịch bản được upload lên
 * @alias /verify
 */
exports.verifyScenario = (req, res) => {
  const messages = scenarioService.verifyScenario(req.body);
  res.status(200).json(messages);
};

/**
 * Updates an existing scenario.
 * @alias /update/:scenarioId
 */
exports.updateScenario = async (req, res) => {
  const { scenarioId } = req.params;
  const userId = req.user.id;
  try {
    await scenarioService.updateScenario(scenarioId, userId, req.body);
    res.status(200).json({ message: "Cập nhật kịch bản thành công." });
  } catch (error) {
    console.error("Lỗi khi cập nhật kịch bản:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

/** Xóa một kịch bản của 1 tài khoản hiện thời
 * @alias /scenarios/:scenarioId
 */
exports.deleteScenario = async (req, res) => {
  const { scenarioId } = req.params;
  const userId = req.user.id;
  try {
    await scenarioService.deleteScenario(scenarioId, userId);
    res.status(200).json({ message: "Xóa kịch bản thành công." });
  } catch (error) {
    console.error("Lỗi khi xóa kịch bản:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

/** Lấy chỉ lấy nội dung của kịch bản (không có thông tin quản lý)
 * và lưu về dạng file
 * @see getScenarioById()  Trả về toàn bộ kịch bản và thông tin quản lý
 * @see exportScenarioById  Trả về nội dung kịch bản và thông tin quản lý, ở dạng file
 * @see getScenarioByShareCode Trả về nội dung kịch bản, không có thông tin quản lý, ở dạng json
 * @alias /share/:shareCode
 */
exports.getScenarioByShareCode = async (req, res) => {
  const { shareCode } = req.params;
  try {
    const scenario = await scenarioService.getScenarioByShareCode(shareCode);
    res.status(200).json(scenario);
  } catch (error) {
    console.error("Lỗi khi lấy kịch bản chia sẻ:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

/** Lấy kịch bản dựa trên id của kịch bản, dạng text
 * @see getScenarioById()  Trả về toàn bộ kịch bản và thông tin quản lý
 * @see exportScenarioById  Trả về nội dung kịch bản, không có thông tin quản lý, ở dạng file
 * @see getScenarioByShareCode Trả về nội dung kịch bản
 * @alias /scenarios/:scenarioId
 */
exports.getScenarioById = async (req, res) => {
  const { scenarioId } = req.params;
  const userId = req.user.id;
  try {
    const scenario = await scenarioService.getScenarioById(scenarioId, userId);    
    res.status(200).json(scenario);
  } catch (error) {
    console.error("Lỗi khi lấy kịch bản:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

/** Lấy nội dung của kịch bản và lưu về dạng file
 * @see getScenarioById()  Trả về toàn bộ kịch bản và thông tin quản lý
 * @see exportScenarioById  Trả về nội dung kịch bản, không có thông tin quản lý, ở dạng file
 * @see getScenarioByShareCode Trả về nội dung kịch bản, không có thông tin quản lý, ở dạng json
 * @alias /scenarios/:scenarioId
 */
exports.exportScenarioById = async (req, res) => {
  const { scenarioId } = req.params;
  const userId = req.user.id;
  try {
    const record = await scenarioService.getScenarioById(scenarioId, userId) ;
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(record.Name+".json")}`);
    const parsedContent = JSON.parse(record.Content);
    const scenario = {
      ...record,
      Content: parsedContent,
    };    
    res.status(200).json(scenario);
  } catch (error) {
    console.error("Lỗi khi lấy kịch bản:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};

/** Lấy toàn bộ kịch bản của 1 tài khoản hiện thời
 * @alias /scenarios/myscenarios
 */
exports.getScenariosByUserId = async (req, res) => {
  const userId = req.user.id;
  try {
    console.log("sfds");
    const scenarios = await scenarioService.getScenariosByUserId(userId);
    res.status(200).json(scenarios);
  } catch (error) {
    console.error("Lỗi khi lấy danh sách kịch bản:", error);
    res.status(500).json({ error: error.message });
  }
};

/** Kích hoạt/Tắt chia sẻ cấu hình
 * @alias /scenarios/share/:scenarioId/
 */
exports.shareScenarioById = async (req, res) => {
  const { scenarioId } = req.params;
  const userId = req.user.id;
  try {
    const scenario = await scenarioService.shareScenario(scenarioId, userId);
    if (scenario.IsShared) {
      res.status(200).json({
        Message: "Chia sẻ kịch bản thành công.",
        ShareCode: scenario.ShareCode,
        IsShared: scenario.IsShared
      });
    } else {
      res.status(200).json({
        message: "Đã ngừng chia sẻ để sử dụng cá nhân.",
        IsShared: scenario.IsShared
      });
    }
  } catch (error) {
    console.error("Lỗi khi chia sẻ kịch bản:", error);
    res.status(error.statusCode || 500).json({ error: error.message });
  }
};