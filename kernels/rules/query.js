const { query } = require("express-validator");
const WithLocale = require("kernels/rules/base");

class QueryWithLocale extends WithLocale 
{
    constructor(field) {
        super(field)
        this.withLocale = query(field)
    }

    matches(regex) {
        this.withLocale = this.withLocale.matches(regex)
        return this;
    }
}

module.exports = QueryWithLocale