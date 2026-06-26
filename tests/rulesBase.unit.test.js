process.env.NODE_ENV = "test";

require("rootpath")();

// Mock express-validator body() to return a chainable builder
function makeChain() {
  const chain = {
    notEmpty: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    bail: jest.fn().mockReturnThis(),
    isEmail: jest.fn().mockReturnThis(),
    isLength: jest.fn().mockReturnThis(),
    custom: jest.fn().mockReturnThis(),
    isString: jest.fn().mockReturnThis(),
    isNumeric: jest.fn().mockReturnThis(),
    isIn: jest.fn().mockReturnThis(),
  };
  return chain;
}

const mockChain = makeChain();
jest.mock("express-validator", () => ({ body: jest.fn().mockReturnValue(mockChain) }));

const WithLocale = require("kernels/rules/base");
const { body } = require("express-validator");

beforeEach(() => {
  jest.clearAllMocks();
  // Reset chain methods to return this
  Object.keys(mockChain).forEach((k) => {
    mockChain[k].mockReturnThis();
  });
});

describe("WithLocale — constructor", () => {
  test("gọi body(field) và lưu field", () => {
    const w = new WithLocale("email");
    expect(body).toHaveBeenCalledWith("email");
    expect(w.field).toBe("email");
  });
});

describe("WithLocale — notEmpty()", () => {
  test("gọi notEmpty().withMessage().bail() và trả this", () => {
    const w = new WithLocale("name");
    const result = w.notEmpty();
    expect(mockChain.notEmpty).toHaveBeenCalled();
    expect(mockChain.withMessage).toHaveBeenCalledWith("Name must be required");
    expect(mockChain.bail).toHaveBeenCalled();
    expect(result).toBe(w);
  });
});

describe("WithLocale — isEmail()", () => {
  test("gọi isEmail().withMessage().bail() và trả this", () => {
    const w = new WithLocale("email");
    const result = w.isEmail();
    expect(mockChain.isEmail).toHaveBeenCalled();
    expect(mockChain.withMessage).toHaveBeenCalledWith("Email is not in correct format");
    expect(result).toBe(w);
  });
});

describe("WithLocale — isLength()", () => {
  test("gọi isLength cho min nếu có", () => {
    const w = new WithLocale("password");
    w.isLength({ min: 8 });
    expect(mockChain.isLength).toHaveBeenCalledWith({ min: 8 });
    expect(mockChain.withMessage).toHaveBeenCalledWith("Password must be at least 8 characters long");
  });

  test("gọi isLength cho max nếu có", () => {
    const w = new WithLocale("bio");
    w.isLength({ max: 200 });
    expect(mockChain.isLength).toHaveBeenCalledWith({ max: 200 });
    expect(mockChain.withMessage).toHaveBeenCalledWith("Bio must be at most 200 characters long");
  });

  test("gọi isLength cho cả min và max", () => {
    const w = new WithLocale("username");
    const result = w.isLength({ min: 3, max: 30 });
    expect(mockChain.isLength).toHaveBeenCalledTimes(2);
    expect(result).toBe(w);
  });

  test("không gọi isLength nếu không có min hay max", () => {
    const w = new WithLocale("field");
    w.isLength({});
    expect(mockChain.isLength).not.toHaveBeenCalled();
  });
});

describe("WithLocale — confirmed()", () => {
  test("gọi custom().bail() và trả this", () => {
    const w = new WithLocale("password");
    const result = w.confirmed("passwordConfirm");
    expect(mockChain.custom).toHaveBeenCalledWith(expect.any(Function));
    expect(mockChain.bail).toHaveBeenCalled();
    expect(result).toBe(w);
  });

  test("custom validator throw khi value !== req.body[fieldToCompare]", () => {
    const w = new WithLocale("password");
    w.confirmed("passwordConfirm");
    const customFn = mockChain.custom.mock.calls[0][0];
    expect(() => customFn("abc", { req: { body: { passwordConfirm: "xyz" } } })).toThrow("Password and passwordConfirm do not match");
  });

  test("custom validator trả true khi match", () => {
    const w = new WithLocale("password");
    w.confirmed("passwordConfirm");
    const customFn = mockChain.custom.mock.calls[0][0];
    expect(customFn("abc", { req: { body: { passwordConfirm: "abc" } } })).toBe(true);
  });
});

describe("WithLocale — unique()", () => {
  test("gọi custom().bail() và trả this", () => {
    const mockModel = { findOne: jest.fn().mockResolvedValue(null) };
    const w = new WithLocale("username");
    const result = w.unique(mockModel, "username");
    expect(mockChain.custom).toHaveBeenCalledWith(expect.any(Function));
    expect(result).toBe(w);
  });

  test("custom validator throw khi record đã tồn tại", async () => {
    const mockModel = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
    const w = new WithLocale("username");
    w.unique(mockModel, "username");
    const customFn = mockChain.custom.mock.calls[0][0];
    await expect(customFn("alice")).rejects.toThrow("Username must be unique");
  });

  test("custom validator không throw khi chưa tồn tại", async () => {
    const mockModel = { findOne: jest.fn().mockResolvedValue(null) };
    const w = new WithLocale("email");
    w.unique(mockModel, "email");
    const customFn = mockChain.custom.mock.calls[0][0];
    await expect(customFn("new@test.com")).resolves.toBeUndefined();
  });
});

describe("WithLocale — isString()", () => {
  test("gọi isString().withMessage().bail() và trả this", () => {
    const w = new WithLocale("title");
    const result = w.isString();
    expect(mockChain.isString).toHaveBeenCalled();
    expect(mockChain.withMessage).toHaveBeenCalledWith("Title must be text");
    expect(result).toBe(w);
  });
});

describe("WithLocale — isNumberic()", () => {
  test("gọi isNumeric().withMessage().bail() và trả this", () => {
    const w = new WithLocale("age");
    const result = w.isNumberic();
    expect(mockChain.isNumeric).toHaveBeenCalled();
    expect(mockChain.withMessage).toHaveBeenCalledWith("Age must be number");
    expect(result).toBe(w);
  });
});

describe("WithLocale — isIn()", () => {
  test("gọi isIn(check, against).withMessage().bail() và trả this", () => {
    const w = new WithLocale("role");
    const result = w.isIn(["admin", "user"], null);
    expect(mockChain.isIn).toHaveBeenCalledWith(["admin", "user"], null);
    expect(mockChain.withMessage).toHaveBeenCalledWith("role must be in allowable range");
    expect(result).toBe(w);
  });
});

describe("WithLocale — get()", () => {
  test("trả withLocale chain", () => {
    const w = new WithLocale("field");
    expect(w.get()).toBe(mockChain);
  });
});
