const app = require("./index");
const { sequelize } = require("./models");
const { isFirebaseReady } = require("./kernels/firebaseAdmin");

const port = process.env.PORT || 2999;
const host = process.env.HOST || "0.0.0.0";

async function startServer() {
    try {
      await sequelize.authenticate();
      console.log("Database connection has been established successfully.");

      await sequelize.sync({ alter: false });

      console.log(
        isFirebaseReady()
          ? "[firebase] Đã kết nối Firestore + Storage (service account hợp lệ)."
          : "[firebase] Chưa kết nối — kiểm tra FIREBASE_SERVICE_ACCOUNT_PATH và file JSON."
      );

      app.listen(port, host, () => {
        console.log(`Server running at http://${host}:${port}`);
      });
    } catch (error) {
      console.error("Unable to connect to the database:", error);
    }
  }
  
  startServer();