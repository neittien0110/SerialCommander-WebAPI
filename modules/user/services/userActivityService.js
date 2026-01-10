const { UserActivity } = require("../../../models");

/**
 * Service để xử lý logic liên quan đến User Activity
 */
class UserActivityService {
  /**
   * Tạo một activity log mới
   * @param {number} userId - ID của user
   * @param {string} activityType - Loại hoạt động
   * @param {string} description - Mô tả
   * @param {object} metadata - Dữ liệu bổ sung (optional)
   * @param {string} ipAddress - IP address (optional)
   * @param {string} userAgent - User agent (optional)
   * @returns {Promise<object>} Activity đã tạo
   */
  static async createActivity(userId, activityType, description, metadata = null, ipAddress = null, userAgent = null) {
    try {
      const activity = await UserActivity.create({
        UserId: userId,
        ActivityType: activityType,
        Description: description,
        Metadata: metadata ? JSON.stringify(metadata) : null,
        IpAddress: ipAddress,
        UserAgent: userAgent,
        CreatedAt: new Date()
      });

      return activity;
    } catch (error) {
      console.error("Error creating user activity:", error);
      throw error;
    }
  }

  /**
   * Lấy lịch sử hoạt động của user
   * @param {number} userId - ID của user
   * @param {object} options - Tùy chọn (limit, offset, activityType, startDate, endDate)
   * @returns {Promise<object>} Danh sách activities và pagination info
   */
  static async getUserActivities(userId, options = {}) {
    try {
      const {
        limit = 50,
        offset = 0,
        activityType = null,
        startDate = null,
        endDate = null,
        orderBy = 'CreatedAt',
        orderDirection = 'DESC'
      } = options;

      const where = { UserId: userId };

      // Filter theo activity type
      if (activityType) {
        where.ActivityType = activityType;
      }

      // Filter theo date range
      if (startDate || endDate) {
        where.CreatedAt = {};
        if (startDate) {
          where.CreatedAt[require('sequelize').Op.gte] = new Date(startDate);
        }
        if (endDate) {
          where.CreatedAt[require('sequelize').Op.lte] = new Date(endDate);
        }
      }

      const { count, rows } = await UserActivity.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [[orderBy, orderDirection]],
        attributes: [
          'Id',
          'ActivityType',
          'Description',
          'Metadata',
          'IpAddress',
          'UserAgent',
          'CreatedAt'
        ]
      });

      // Parse metadata từ JSON string
      const activities = rows.map(activity => {
        const activityData = activity.toJSON();
        if (activityData.Metadata) {
          try {
            activityData.Metadata = JSON.parse(activityData.Metadata);
          } catch (e) {
            activityData.Metadata = null;
          }
        }
        return activityData;
      });

      return {
        activities,
        pagination: {
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: count > offset + parseInt(limit)
        }
      };
    } catch (error) {
      console.error("Error fetching user activities:", error);
      throw error;
    }
  }

  /**
   * Lấy thống kê hoạt động của user
   * @param {number} userId - ID của user
   * @param {Date} startDate - Ngày bắt đầu (optional)
   * @param {Date} endDate - Ngày kết thúc (optional)
   * @returns {Promise<object>} Thống kê
   */
  static async getUserActivityStats(userId, startDate = null, endDate = null) {
    try {
      const where = { UserId: userId };

      if (startDate || endDate) {
        where.CreatedAt = {};
        if (startDate) {
          where.CreatedAt[require('sequelize').Op.gte] = new Date(startDate);
        }
        if (endDate) {
          where.CreatedAt[require('sequelize').Op.lte] = new Date(endDate);
        }
      }

      // Đếm theo từng loại activity
      const activities = await UserActivity.findAll({
        where,
        attributes: [
          'ActivityType',
          [require('sequelize').fn('COUNT', require('sequelize').col('Id')), 'count']
        ],
        group: ['ActivityType'],
        raw: true
      });

      // Tổng số activities
      const total = await UserActivity.count({ where });

      // Activity đầu tiên và cuối cùng
      const firstActivity = await UserActivity.findOne({
        where,
        order: [['CreatedAt', 'ASC']],
        attributes: ['CreatedAt']
      });

      const lastActivity = await UserActivity.findOne({
        where,
        order: [['CreatedAt', 'DESC']],
        attributes: ['CreatedAt']
      });

      return {
        total,
        byType: activities.reduce((acc, item) => {
          acc[item.ActivityType] = parseInt(item.count);
          return acc;
        }, {}),
        firstActivityDate: firstActivity ? firstActivity.CreatedAt : null,
        lastActivityDate: lastActivity ? lastActivity.CreatedAt : null
      };
    } catch (error) {
      console.error("Error fetching user activity stats:", error);
      throw error;
    }
  }

  /**
   * Xóa activities cũ (cleanup)
   * @param {number} daysToKeep - Số ngày giữ lại (mặc định 90 ngày)
   * @returns {Promise<number>} Số lượng records đã xóa
   */
  static async cleanupOldActivities(daysToKeep = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const deleted = await UserActivity.destroy({
        where: {
          CreatedAt: {
            [require('sequelize').Op.lt]: cutoffDate
          }
        }
      });

      return deleted;
    } catch (error) {
      console.error("Error cleaning up old activities:", error);
      throw error;
    }
  }
}

module.exports = UserActivityService;



