// index.js
const { config } = require('configs')
const {Sequelize} = require('sequelize')
const {Umzug, SequelizeStorage} = require('umzug')

const testDb = config.database.test;

const sequelize = new Sequelize(testDb.database, testDb.username,testDb.password, {
    host: testDb.host,
    dialect: 'mysql',
    dialectOptions: testDb.dialectOptions
})

const umzug = new Umzug({
    migrations: {
        glob: 'database/migrations/*.js',
        resolve: ({ name, path, context }) => {
            const migration = require(path || '')
            return {
                name,
                up: async () => migration.up(context, Sequelize),
                down: async () => migration.down(context, Sequelize),
            }
        },
    },
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({sequelize}),
    logger: console,
    logging: false
})

module.exports = {
    umzug,
    sequelize
}
