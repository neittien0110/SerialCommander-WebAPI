module.exports = async () => {
    const sequelize = global.__SEQUELIZE__;
    const umzug = global.__UMZUG__;

    if (sequelize) {
        try {
            await umzug.down({to: 0})
            await sequelize.close();
        } catch (error) {
            console.error(error);
        }
    }
};