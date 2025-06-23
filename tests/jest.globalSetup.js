require("rootpath")();
const { umzug,sequelize } = require("kernels/tests");

module.exports = async () => {
    try {
        await sequelize.authenticate()
        await umzug.up()
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

global.__SEQUELIZE__ = sequelize;
global.__UMZUG__=umzug;
