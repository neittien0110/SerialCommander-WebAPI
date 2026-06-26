process.env.NODE_ENV = "test";

require("rootpath")();

// Mock express-validator: body/param/query all return a chainable object
function makeChain() {
  const chain = {
    notEmpty: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    bail: jest.fn().mockReturnThis(),
    matches: jest.fn().mockReturnThis(),
    isEmail: jest.fn().mockReturnThis(),
    isLength: jest.fn().mockReturnThis(),
    custom: jest.fn().mockReturnThis(),
    isString: jest.fn().mockReturnThis(),
    isNumeric: jest.fn().mockReturnThis(),
    isIn: jest.fn().mockReturnThis(),
  };
  return chain;
}

const mockBodyChain = makeChain();
const mockParamChain = makeChain();
const mockQueryChain = makeChain();

jest.mock("express-validator", () => ({
  body: jest.fn().mockReturnValue(mockBodyChain),
  param: jest.fn().mockReturnValue(mockParamChain),
  query: jest.fn().mockReturnValue(mockQueryChain),
}));

const { body, param, query } = require("express-validator");
const BodyWithLocale = require("kernels/rules/body");
const ParamWithLocale = require("kernels/rules/param");
const QueryWithLocale = require("kernels/rules/query");
const { BodyWithLocale: BodyIdx, ParamWithLocale: ParamIdx, QueryWithLocale: QueryIdx } =
  require("kernels/rules/index");

beforeEach(() => jest.clearAllMocks());

describe("BodyWithLocale", () => {
  test("constructor gọi body(field)", () => {
    const w = new BodyWithLocale("email");
    expect(body).toHaveBeenCalledWith("email");
    expect(w.field).toBe("email");
  });

  test("kế thừa WithLocale — notEmpty() hoạt động", () => {
    const w = new BodyWithLocale("name");
    w.notEmpty();
    expect(mockBodyChain.notEmpty).toHaveBeenCalled();
  });

  test("get() trả chain", () => {
    const w = new BodyWithLocale("title");
    expect(w.get()).toBe(mockBodyChain);
  });
});

describe("ParamWithLocale", () => {
  test("constructor gọi param(field)", () => {
    const w = new ParamWithLocale("id");
    expect(param).toHaveBeenCalledWith("id");
    expect(w.field).toBe("id");
  });

  test("matches(regex) gọi chain.matches và trả this", () => {
    const w = new ParamWithLocale("id");
    const result = w.matches(/^\d+$/);
    expect(mockParamChain.matches).toHaveBeenCalledWith(/^\d+$/);
    expect(result).toBe(w);
  });

  test("kế thừa WithLocale — isEmail() hoạt động", () => {
    const w = new ParamWithLocale("email");
    w.isEmail();
    expect(mockParamChain.isEmail).toHaveBeenCalled();
  });
});

describe("QueryWithLocale", () => {
  test("constructor gọi query(field)", () => {
    const w = new QueryWithLocale("search");
    expect(query).toHaveBeenCalledWith("search");
    expect(w.field).toBe("search");
  });

  test("matches(regex) gọi chain.matches và trả this", () => {
    const w = new QueryWithLocale("sort");
    const result = w.matches(/^(asc|desc)$/);
    expect(mockQueryChain.matches).toHaveBeenCalledWith(/^(asc|desc)$/);
    expect(result).toBe(w);
  });
});

describe("kernels/rules/index re-exports", () => {
  test("BodyWithLocale, ParamWithLocale, QueryWithLocale được export đúng", () => {
    expect(BodyIdx).toBe(BodyWithLocale);
    expect(ParamIdx).toBe(ParamWithLocale);
    expect(QueryIdx).toBe(QueryWithLocale);
  });
});
