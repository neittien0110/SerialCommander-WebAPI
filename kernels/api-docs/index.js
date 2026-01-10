const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "Serial Commander API",
            version: "1.0.0",
            description: "API documentation for Serial Commander application",
        },
        servers: [
            {
                url: "http://localhost:2999",
                description: "Development server",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
    },
    // Đọc JSDoc comments từ các file routes và controllers
    apis: [
        path.join(__dirname, "../../routes/*.js"),
        path.join(__dirname, "../../modules/**/*.js"),
    ],
};

const openapiSpecification = swaggerJsdoc(options);

module.exports = {
    swaggerUIServe: swaggerUi.serve,
    swaggerUISetup: swaggerUi.setup(openapiSpecification)
}