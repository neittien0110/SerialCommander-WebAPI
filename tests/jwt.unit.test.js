process.env.NODE_ENV = "test";

const mockGetJwtSecret = jest.fn().mockReturnValue("test-jwt-secret");
jest.mock("../configs/envSecrets", () => ({
  getJwtSecret: mockGetJwtSecret,
  getSessionSecret: jest.fn().mockReturnValue("test-session-secret"),
}));

describe("configs/jwt", () => {
  beforeEach(() => jest.clearAllMocks());

  test("secret getter gọi getJwtSecret() và trả về giá trị", () => {
    const jwtConfig = require("../configs/jwt");
    expect(jwtConfig.secret).toBe("test-jwt-secret");
    expect(mockGetJwtSecret).toHaveBeenCalled();
  });

  test("secret getter gọi getJwtSecret() mỗi lần truy cập", () => {
    const jwtConfig = require("../configs/jwt");
    jwtConfig.secret;
    jwtConfig.secret;
    expect(mockGetJwtSecret).toHaveBeenCalledTimes(2);
  });

  test("ttl dùng JWT_TTL env nếu có", () => {
    jest.resetModules();
    process.env.JWT_TTL = "7d";
    jest.doMock("../configs/envSecrets", () => ({ getJwtSecret: jest.fn() }));
    const jwtConfig = require("../configs/jwt");
    expect(jwtConfig.ttl).toBe("7d");
    delete process.env.JWT_TTL;
  });

  test("ttl mặc định là '1d' nếu không có JWT_TTL", () => {
    jest.resetModules();
    delete process.env.JWT_TTL;
    jest.doMock("../configs/envSecrets", () => ({ getJwtSecret: jest.fn() }));
    const jwtConfig = require("../configs/jwt");
    expect(jwtConfig.ttl).toBe("1d");
  });
});
