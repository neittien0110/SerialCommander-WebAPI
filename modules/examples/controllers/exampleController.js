const responseUtils = require("utils/responseUtils")

const exampleController = {
    exampleRequest: (req, res) => {
        return responseUtils.ok(res, {
            data: 'data'
        })
    }
}

module.exports = exampleController