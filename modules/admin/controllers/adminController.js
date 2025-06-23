const adminService = require("../services/adminService");

exports.getSharedConfigs = async (req, res) => {
  try {
    const configs = await adminService.getSharedConfigs();
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 

exports.deleteSharedConfig = async (req, res) => {
  try {
    const deleted = await adminService.deleteSharedConfig(req.params.id);
    res.json({ message: "Đã xóa thành công", deleted });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

exports.approveSharedConfig = async (req, res) => {
  try {
    const approved = await adminService.approveSharedConfig(req.params.id);
    res.json({ message: "Đã duyệt thành công", approved });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};
