const { Scenario } = require("../../../models");
const { v4: uuidv4 } = require("uuid");

/**
 * Verifies if the scenario data is valid and conforms to the Scenario model's requirements.
 * This function performs basic validation on the received data and collects all errors and warnings.
 * @param {object} scenarioData - The scenario data to validate.
 * @returns {object} An object containing the validated data, a list of errors, and a list of warnings.
 */
exports.verifyScenario = (scenarioData) => {
  const errors = [];
  const warnings = [];

  // --- 1. Kiểm tra sự tồn tại của dữ liệu và kiểu dữ liệu
  if (!scenarioData || typeof scenarioData !== 'object') {
    errors.push('Dữ liệu kịch bản không hợp lệ hoặc bị thiếu.');
    return { data: null, errors, warnings };
  }

  // --- 2. Kiểm tra các trường bắt buộc và kiểu dữ liệu
  if (!scenarioData.Name || typeof scenarioData.Name !== 'string' || scenarioData.Name.trim() === '') {
    errors.push('Trường "Name" không hợp lệ hoặc bị thiếu.');
  }

  // --- 2. Kiểm tra các trường bắt buộc và kiểu dữ liệu
  if (!scenarioData.Description || typeof scenarioData.Description !== 'string' || scenarioData.Description.trim() === '') {
    warnings.push('Trường "Description" giúp giải thích rõ hơn về kịch bản.');
  }

// --- 3. Kiểm tra trường Content (là chuỗi JSON)
  if (!scenarioData.Content) {
    warnings.push('Trường "Content" thiếu hoặc không phải là mảng Json.');
  } else if (scenarioData.Content) {
    try {
      const parsedContent = JSON.parse(scenarioData.Content);
      if (!Array.isArray(parsedContent)) {
        errors.push('Trường "Content" phải là một chuỗi JSON đại diện cho một mảng.');
      } else {
        // Kiểm tra cấu trúc của từng phần tử trong mảng Content
        parsedContent.forEach((item, index) => {
          if (typeof item !== 'object' || item === null) {
            errors.push(`Phần tử Content[${index}] không phải là một đối tượng.`);
          } else {
            if (typeof item.Name !== 'string' || item.Name.trim() === '') {
              errors.push(`Trường Name của Content[${index}] không hợp lệ.`);
            }
            if (typeof item.Type !== 'string' || item.Type.trim() === '') {
              errors.push(`Trường Type của Content[${index}] không hợp lệ.`);
            }
            // Các trường List và DefaultValue có thể là null hoặc chuỗi
            if (item.List !== null && typeof item.List !== 'string') {
                warnings.push(`Trường List của Content[${index}] nên là kiểu chuỗi hoặc null.`);
            }
            if (item.DefaultValue !== null && typeof item.DefaultValue !== 'string') {
                warnings.push(`Trường DefaultValue của Content[${index}] nên là kiểu chuỗi hoặc null.`);
            }
          }
        });
      }
    } catch (e) {
      errors.push('Trường "Content" không phải là một chuỗi JSON hợp lệ.');
    }
  }

  // --- 4. Kiểm tra các trường tùy chọn khác (dựa trên DeviceConfig và Scenario model)
  if (scenarioData.Baudrate && typeof scenarioData.Baudrate !== 'number') {
    warnings.push('Trường "Baudrate" nên là kiểu số.');
  }

  const validParities = ['none', 'even', 'odd', 'mark', 'space'];
  if (scenarioData.Parity && !validParities.includes(scenarioData.Parity.toLowerCase())) {
    warnings.push(`Trường "Parity" không hợp lệ. Các giá trị hợp lệ là: ${validParities.join(', ')}.`);
  }

  const validStopBits = [1, 1.5, 2];
  if (scenarioData.StopBit && !validStopBits.includes(scenarioData.StopBit)) {
    warnings.push(`Trường "StopBit" không hợp lệ. Các giá trị hợp lệ là: ${validStopBits.join(', ')}.`);
  }

  if (scenarioData.DataLength && typeof scenarioData.DataLength !== 'number' 
    && typeof scenarioData.DataLength !== 7 && typeof scenarioData.DataLength !== 8) {
    warnings.push('Trường "DataLength" nên là kiểu số, với giá trị 7, hoăc 8 ');
  }

  if (scenarioData.NewLine && typeof scenarioData.NewLine !== 'string') {
    warnings.push('Trường "NewLine" nên là kiểu chuỗi.');
  }

  if (scenarioData.Banner1 && typeof scenarioData.Banner1 !== 'string') {
    warnings.push('Trường "Banner1" nên là kiểu chuỗi.');
  }

  if (scenarioData.Banner2 && typeof scenarioData.Banner2 !== 'string') {
    warnings.push('Trường "Banner2" nên là kiểu chuỗi.');
  }

  // --- 5. Trả về kết quả
  // Nếu có lỗi, trả về null cho data để biểu thị việc xác thực thất bại
  const data = errors.length > 0 ? null : scenarioData;
  return { data, errors, warnings };
};


/**
 * Creates a new scenario for a specific user.
 * @param {string} userId - The ID of the user creating the scenario.
 * @param {object} scenarioData - The data for the new scenario.
 * @returns {Promise<object>} A promise that resolves to the created scenario object.
 */
exports.createScenario = async (userId, scenarioData) => {
  try {
    const newScenario = await Scenario.create({
      Name: scenarioData.Name,
      Description: scenarioData.Description,
      UserId: userId,
      Baudrate: scenarioData.Baudrate,
      Parity: scenarioData.Parity,
      StopBit: scenarioData.StopBit,
      DataLength: scenarioData.DataLength,
      NewLine: scenarioData.NewLine,
      Banner1: scenarioData.Banner1,
      Banner2: scenarioData.Banner2,     
      Content: JSON.stringify(scenarioData.Content),
    });
    return newScenario;
  } catch (error) {
    console.error('Nội dung bản ghi:', error);
    throw new Error('Failed to create scenario.');
  }
};

/**
 * Tìm kịch bản dựa trên tham số
 * @param {string} id - ID của kịch bản
 * @param {string} userId - Id của người sở hữu
 * @returns {Promise<object>} Toàn bộ bản ghi về Kịch bản trong DB
 */
exports.getScenarioById = async (id, userId) => {
  try {
    const scenario = await Scenario.findOne({
      where: { Id: id, UserId: userId },
    });
    if (!scenario) {
      const error = new Error("Không tìm thấy kịch bản hoặc không có quyền truy cập.");
      error.statusCode = 404;
      throw error;
    }
    // Lưu ý, chỉ trả về đúng dữ liệu thô, bỏ qua các metadata của sequelize
    return scenario.dataValues;
  } catch (error) {
    console.error('Error in ScenarioService.getScenarioById:', error);
    throw new Error('Failed to retrieve scenario.');
  }
};

/**
 * Updates an existing scenario.
 * @param {string} id - The ID of the scenario to update.
 * @param {string} userId - The ID of the user who owns the scenario.
 * @param {object} updateData - The data to update the scenario with.
 * @returns {Promise<number>} A promise that resolves to the number of updated rows.
 */
exports.updateScenario = async (id, userId, updateData) => {
  try {
    const [updatedRows] = await Scenario.update(updateData, {
      where: { Id: id, UserId: userId },
    });
    if (updatedRows === 0) {
      const error = new Error("Không tìm thấy kịch bản để cập nhật hoặc không có quyền.");
      error.statusCode = 404;
      throw error;
    }
    return updatedRows;
  } catch (error) {
    console.error('Error in ScenarioService.updateScenario:', error);
    throw new Error('Failed to update scenario.');
  }
};

/**
 * Xóa một kịch bản
 * @param {string} id - The ID of the scenario to delete.
 * @param {string} userId - The ID of the user who owns the scenario.
 * @returns {Promise<number>} A promise that resolves to the number of deleted rows.
 */
exports.deleteScenario = async (id, userId) => {
  try {
    const deletedRows = await Scenario.destroy({
      where: { Id: id, UserId: userId },
    });
    if (deletedRows === 0) {
      const error = new Error("Không tìm thấy kịch bản để xóa hoặc không có quyền.");
      error.statusCode = 404;
      throw error;
    }
    return deletedRows;
  } catch (error) {
    console.error('Error in ScenarioService.deleteScenario:', error);
    throw new Error('Failed to delete scenario.');
  }
};

/**
 * Retrieves all scenarios belonging to a specific user.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of scenario objects.
 */
exports.getScenariosByUserId = async (userId) => {
  try {
    const scenarios = await Scenario.findAll({
      where: { UserId: userId },
      order: [['CreatedAt', 'DESC']],
    });
    return scenarios;
  } catch (error) {
    console.error('Error in ScenarioService.getScenariosByUserId:', error);
    throw new Error('Failed to retrieve scenarios for the user.');
  }
};


/**
 * Creates a new share code.
 * @returns {string} The generated share code.
 */
function generateShareCode() {
  return uuidv4().slice(0, 5);
}

/**
 * Kích hoat hoặc Ngừng quá trình chia sẻ cấu hình
 * @param {string} id - The ID of the scenario.
 * @param {string} userId - The ID of the user who owns the scenario.
 * @returns {Promise<object>} A promise that resolves to the updated scenario object with a share code.
 */
exports.shareScenario = async (id, userId) => {
  try {
    const scenario = await Scenario.findOne({
      where: { Id: id, UserId: userId }
    });
    if (!scenario) {
      const error = new Error("Không tìm thấy kịch bản hoặc không có quyền.");
      error.statusCode = 404;
      throw error;
    }
    // Đảo ngược tình trạng chia sẻ. Chia sẻ --> Ngừng ---> Chia sẻ
    scenario.IsShared = !scenario.IsShared;
    // Nếu chưa có mã chia sẻ thì tạo mới.    
    if (!scenario.ShareCode) {
      scenario.ShareCode = generateShareCode();
    }
    await scenario.save();
    return scenario;
  } catch (error) {
    console.error('Error in ScenarioService.shareScenario:', error);
    throw new Error('Failed to share scenario.');
  }
};

/**
 * Retrieves a scenario by its share code.
 * @param {string} shareCode - The share code of the scenario.
 * @returns {Promise<object>} A promise that resolves to the shared scenario object.
 */
exports.getScenarioByShareCode = async (shareCode) => {
  let scenario;
  try {
      scenario = await Scenario.findOne({
      where: { ShareCode: shareCode, IsShared: true },
      attributes: ['Name', "Description", 'IsShared', "ShareCode", 'Baudrate', 'DataLength', 'Parity', 'StopBit', "NewLine" , 'Banner1', 'Banner2', 'Content']
    });
    if (!scenario) {
      const error = new Error(`Không tìm thấy kịch bản chia sẻ với mã ${shareCode}.`);
      error.statusCode = 404;
      throw error;
    }
  } catch (error) {
    throw new Error('Lỗi truy cập DB.');
  }
  return scenario;
};
