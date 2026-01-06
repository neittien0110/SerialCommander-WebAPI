const { param } = require("express-validator");
const WithLocale = require("kernels/rules/base");

class ParamWithLocale extends WithLocale 
{
    constructor(field) {
        super(field)
        this.withLocale = param(field)
    }

    matches(regex) {
        this.withLocale = this.withLocale.matches(regex)
        return this;
    }
}

module.exports = ParamWithLocale