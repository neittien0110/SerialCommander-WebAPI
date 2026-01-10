const UserActivityService = require("../services/userActivityService");

/**
 * Controller để xử lý các request liên quan đến User Activity
 */

/**
 * Lấy lịch sử hoạt động của user hiện tại
 * GET /api/user/activities
 */
exports.getUserActivities = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      limit = 50,
      offset = 0,
      activityType,
      startDate,
      endDate,
      orderBy = 'CreatedAt',
      orderDirection = 'DESC'
    } = req.query;

    const result = await UserActivityService.getUserActivities(userId, {
      limit,
      offset,
      activityType,
      startDate,
      endDate,
      orderBy,
      orderDirection
    });

    res.json({
      message: "Lấy lịch sử hoạt động thành công",
      ...result
    });
  } catch (error) {
    console.error("Error in getUserActivities:", error);
    res.status(500).json({
      message: "Lỗi khi lấy lịch sử hoạt động",
      error: error.message
    });
  }
};

/**
 * Lấy thống kê hoạt động của user hiện tại
 * GET /api/user/activities/stats
 */
exports.getUserActivityStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    const stats = await UserActivityService.getUserActivityStats(
      userId,
      startDate || null,
      endDate || null
    );

    res.json({
      message: "Lấy thống kê hoạt động thành công",
      stats
    });
  } catch (error) {
    console.error("Error in getUserActivityStats:", error);
    res.status(500).json({
      message: "Lỗi khi lấy thống kê hoạt động",
      error: error.message
    });
  }
};

/**
 * Tạo activity log mới (thường được gọi từ middleware hoặc các controller khác)
 * POST /api/user/activities
 */
exports.createActivity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { activityType, description, metadata } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    if (!activityType) {
      return res.status(400).json({
        message: "activityType là bắt buộc"
      });
    }

    const activity = await UserActivityService.createActivity(
      userId,
      activityType,
      description,
      metadata,
      ipAddress,
      userAgent
    );

    res.status(201).json({
      message: "Tạo activity log thành công",
      activity
    });
  } catch (error) {
    console.error("Error in createActivity:", error);
    res.status(500).json({
      message: "Lỗi khi tạo activity log",
      error: error.message
    });
  }
};



