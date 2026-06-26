process.env.NODE_ENV = "test";

jest.mock("jsonwebtoken", () => ({ sign: jest.fn().mockReturnValue("signed-token"), decode: jest.fn() }));
jest.mock("../../configs/jwt", () => ({ ttl: "1d" }));
jest.mock("../../configs/envSecrets", () => ({ getJwtSecret: jest.fn().mockReturnValue("test-secret") }));
jest.mock("../../kernels/middlewares/errorHandler", () => ({ sendError: jest.fn() }));
jest.mock("../../kernels/logging/appLogger", () => ({ logError: jest.fn() }));
jest.mock("./services/refreshTokenService", () => ({ REFRESH_TTL_SEC: 604800 }));

require("rootpath")();
const svc = require("./authHttpService");
const jwt = require("jsonwebtoken");
const { sendError } = require("../../kernels/middlewares/errorHandler");
const { logError } = require("../../kernels/logging/appLogger");

const makeRes = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });

beforeEach(() => jest.clearAllMocks());

describe("generateToken", () => {
  test("sign JWT với payload id/username/role/type=access", () => {
    const user = { id: 1, username: "alice", email: "a@t.com", role: "user" };
    const token = svc.generateToken(user);
    expect(jwt.sign).toHaveBeenCalledWith(
      { id: 1, username: "alice", role: "user", type: "access" },
      "test-secret",
      { expiresIn: "1d" }
    );
    expect(token).toBe("signed-token");
  });

  test("dùng email khi username null/undefined", () => {
    svc.generateToken({ id: 2, username: null, email: "b@t.com", role: "user" });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ username: "b@t.com" }),
      expect.anything(),
      expect.anything()
    );
  });
});

describe("getAuthCookieOptions", () => {
  test("httpOnly=true, path=/", () => {
    const opts = svc.getAuthCookieOptions();
    expect(opts.httpOnly).toBe(true);
    expect(opts.path).toBe("/");
  });

  test("secure=false khi NODE_ENV=test", () => {
    expect(svc.getAuthCookieOptions().secure).toBe(false);
  });

  test("sameSite=none khi COOKIE_SAME_SITE=none", () => {
    process.env.COOKIE_SAME_SITE = "none";
    expect(svc.getAuthCookieOptions().sameSite).toBe("none");
    delete process.env.COOKIE_SAME_SITE;
  });

  test("sameSite=lax khi không có COOKIE_SAME_SITE", () => {
    delete process.env.COOKIE_SAME_SITE;
    expect(svc.getAuthCookieOptions().sameSite).toBe("lax");
  });
});

describe("setAuthCookie", () => {
  test("gọi res.cookie với sc_auth_token + maxAge 1 ngày (86400000ms)", () => {
    const res = makeRes();
    svc.setAuthCookie(res, "tok");
    expect(res.cookie).toHaveBeenCalledWith(
      "sc_auth_token",
      "tok",
      expect.objectContaining({ httpOnly: true, maxAge: 86400000 })
    );
  });
});

describe("setRefreshCookie", () => {
  test("gọi res.cookie với sc_refresh_token + maxAge = REFRESH_TTL_SEC * 1000", () => {
    const res = makeRes();
    svc.setRefreshCookie(res, "ref");
    expect(res.cookie).toHaveBeenCalledWith(
      "sc_refresh_token",
      "ref",
      expect.objectContaining({ httpOnly: true, maxAge: 604800000 })
    );
  });
});

describe("clearAuthCookie", () => {
  test("xóa sc_auth_token và sc_refresh_token", () => {
    const res = makeRes();
    svc.clearAuthCookie(res);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
    const names = res.clearCookie.mock.calls.map((c) => c[0]);
    expect(names).toContain("sc_auth_token");
    expect(names).toContain("sc_refresh_token");
  });
});

describe("extractRefreshTokenFromCookie", () => {
  test("trả null khi không có cookie header", () => {
    expect(svc.extractRefreshTokenFromCookie({ headers: {} })).toBeNull();
  });

  test("trích xuất sc_refresh_token từ nhiều cookie", () => {
    const req = { headers: { cookie: "sc_auth_token=access; sc_refresh_token=myref" } };
    expect(svc.extractRefreshTokenFromCookie(req)).toBe("myref");
  });

  test("trả null khi không có sc_refresh_token", () => {
    const req = { headers: { cookie: "sc_auth_token=access" } };
    expect(svc.extractRefreshTokenFromCookie(req)).toBeNull();
  });

  test("decode URL-encoded value", () => {
    const encoded = encodeURIComponent("tok+en/=");
    const req = { headers: { cookie: `sc_refresh_token=${encoded}` } };
    expect(svc.extractRefreshTokenFromCookie(req)).toBe("tok+en/=");
  });
});

describe("decodeRefreshPayload", () => {
  test("trả về kết quả jwt.decode", () => {
    jwt.decode.mockReturnValueOnce({ id: 1, tokenId: "tid" });
    expect(svc.decodeRefreshPayload("raw.jwt.token")).toEqual({ id: 1, tokenId: "tid" });
  });

  test("trả null khi jwt.decode throw", () => {
    jwt.decode.mockImplementationOnce(() => { throw new Error("bad"); });
    expect(svc.decodeRefreshPayload("bad")).toBeNull();
  });
});

describe("sendServiceErrorOrInternal", () => {
  test("dùng error.status + error.code khi có đủ", () => {
    const res = makeRes();
    const err = { status: 422, code: "UNPROCESSABLE", message: "lỗi" };
    svc.sendServiceErrorOrInternal(res, err, "FALLBACK", "label");
    expect(sendError).toHaveBeenCalledWith(res, 422, "lỗi", "UNPROCESSABLE");
    expect(logError).not.toHaveBeenCalled();
  });

  test("500 fallback + logError khi không có error.status", () => {
    const res = makeRes();
    svc.sendServiceErrorOrInternal(res, new Error("crash"), "FALLBACK_CODE", "Fallback");
    expect(logError).toHaveBeenCalled();
    expect(sendError).toHaveBeenCalledWith(res, 500, expect.any(String), "FALLBACK_CODE");
  });
});
