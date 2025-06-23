const { body } = require("express-validator");
const WithLocale = require("kernels/rules/base");

class BodyWithLocale extends WithLocale 
{
    constructor(field) {
        super(field)
        this.withLocale = body(field)
    }
}

module.exports = BodyWithLocale