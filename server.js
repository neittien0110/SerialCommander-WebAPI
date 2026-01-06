const app = require("./index");
const {sequelize} = require("./models")

const port = 2999;
const interface = "0.0.0.0";

async function startServer() {
    try {
      await sequelize.authenticate();
      console.log("Database connection has been established successfully.");

       await sequelize.sync({ alter: false }); // Set back to false after schema is updated
      // await sequelize.sync({ alter: true }); // Temporarily set to true to add new columns (already done)
      // await sequelize.sync({ force: true }); // to drop & recreate

      app.listen(port, interface, () => {
        console.log(`Server running at http://${interface}:${port}`);
      });
    } catch (error) {
      console.error("Unable to connect to the database:", error);
    }
  }
  
  startServer();