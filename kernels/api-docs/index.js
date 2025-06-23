const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
    definition: {
    openapi: "3.0.0",
    info: {
        title: "Open API Coding Blog ",
        version: "1.0.11",
    },
    servers: [
        {
        url: "http://localhost:3000",
        },
    ],
    },
    apis: ["./swagger/*.yaml"],
};

const openapiSpecification = swaggerJsdoc(options);

module.exports = {
    swaggerUIServe: swaggerUi.serve,
    swaggerUISetup: swaggerUi.setup(openapiSpecification)
}