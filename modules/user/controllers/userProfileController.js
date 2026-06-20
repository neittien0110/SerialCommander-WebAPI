const { sendError, sendSuccess } = require("../../../kernels/middlewares/errorHandler");
const { updateUserProfile } = require("../services/userProfileService");
const { User } = require("../../../models");

exports.getProfile = async (req, res) => {
  try {
    // Lấy thông tin đầy đủ từ database
    const user = await User.findByPk(req.user.id, {
      attributes: ["id", "username", "email", "role", "provider", "googleId", "isVerified"],
    });

    if (!user) {
      return sendError(res, 404, "User not found", "USER_NOT_FOUND");
    }

    return sendSuccess(res, 200, "Đây là thông tin profile của bạn", {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        provider: user.provider || "local",
        isVerified: user.isVerified === true,
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return sendError(res, 500, "Internal server error", "USER_PROFILE_FETCH_FAILED");
  }
};

exports.updateProfile = async (req, res) => {
  const { username } = req.body || {};
  try {
    const { user } = await updateUserProfile(req.user.id, { username });
    return sendSuccess(res, 200, "Cập nhật hồ sơ thành công", {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        provider: user.provider || "local",
        isVerified: user.isVerified === true,
      },
    });
  } catch (error) {
    const status = Number(error.status) || 500;
    const code = error.code || "USER_PROFILE_UPDATE_FAILED";
    if (status >= 500) {
      console.error("updateProfile error:", error);
    }
    return sendError(res, status, error.message || "Không thể cập nhật hồ sơ", code);
  }
};
