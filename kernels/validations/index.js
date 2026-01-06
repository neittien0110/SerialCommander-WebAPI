const { validationResult } = require("express-validator");
const response = require("utils/responseUtils");

const validate = (validationArray) => {
  return async (req, res, next) => {
    // Kiểm tra xem validationArray có phải là một mảng không
    if (!Array.isArray(validationArray)) {
      return response.invalidated(res, {
        message: "Validation must be an array",
      });
    }

    // Chạy từng validation trong validationArray
    for (let _validation of validationArray) {
      await _validation.run(req);
    }

    // Kiểm tra kết quả validation
    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next(); // Không có lỗi, tiếp tục với middleware tiếp theo
    }

    return response.invalidated(res, {
      errors: errors.array(), // Trả về danh sách lỗi
    });
  };
};

module.exports = { validate };
