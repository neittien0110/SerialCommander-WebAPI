process.env.NODE_ENV = "test";

jest.mock("../kernels/logging/appLogger", () => ({ logError: jest.fn() }));

const { logError } = require("../kernels/logging/appLogger");

function fresh() {
  jest.resetModules();
  jest.mock("../kernels/logging/appLogger", () => ({ logError: jest.fn() }));
  return require("../kernels/middlewares/errorHandler");
}

function mockRes(traceId) {
  const json = jest.fn().mockReturnThis();
  const status = jest.fn().mockReturnThis();
  return { locals: traceId ? { traceId } : {}, status, json, headersSent: false };
}

describe("errorHandler module", () => {
  afterEach(() => {
    jest.resetModules();
  });

  describe("sendError", () => {
    test("trả về status + payload {message, error.code, error.message}", () => {
      const { sendError } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendError(res, 400, "bad input", "INVALID_INPUT");
      expect(res.status).toHaveBeenCalledWith(400);
      const payload = res.json.mock.calls[0][0];
      expect(payload.message).toBe("bad input");
      expect(payload.error.code).toBe("INVALID_INPUT");
      expect(payload.error.message).toBe("bad input");
    });

    test("dùng BAD_REQUEST làm mã mặc định khi không truyền code", () => {
      const { sendError } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendError(res, 422, "no code");
      expect(res.json.mock.calls[0][0].error.code).toBe("BAD_REQUEST");
    });

    test("thêm error.details khi được truyền vào", () => {
      const { sendError } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendError(res, 400, "msg", "CODE", { field: "email" });
      expect(res.json.mock.calls[0][0].error.details).toEqual({ field: "email" });
    });

    test("không thêm error.details khi không truyền", () => {
      const { sendError } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendError(res, 400, "msg", "CODE");
      expect(res.json.mock.calls[0][0].error.details).toBeUndefined();
    });

    test("thêm trace_id vào payload khi res.locals.traceId có giá trị", () => {
      const { sendError } = require("../kernels/middlewares/errorHandler");
      const res = mockRes("abc-123");
      sendError(res, 400, "msg", "CODE");
      expect(res.json.mock.calls[0][0].trace_id).toBe("abc-123");
    });

    test("không có trace_id trong payload khi res.locals.traceId rỗng", () => {
      const { sendError } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendError(res, 400, "msg", "CODE");
      expect(res.json.mock.calls[0][0].trace_id).toBeUndefined();
    });
  });

  describe("sendSuccess", () => {
    test("merge object data trực tiếp vào payload (không wrap trong .data)", () => {
      const { sendSuccess } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendSuccess(res, 200, "ok", { items: [1, 2, 3] });
      const payload = res.json.mock.calls[0][0];
      expect(payload.items).toEqual([1, 2, 3]);
      expect(payload.data).toBeUndefined();
    });

    test("wrap array data vào payload.data", () => {
      const { sendSuccess } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendSuccess(res, 200, "ok", [1, 2]);
      expect(res.json.mock.calls[0][0].data).toEqual([1, 2]);
    });

    test("wrap giá trị primitive vào payload.data", () => {
      const { sendSuccess } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendSuccess(res, 200, "ok", 42);
      expect(res.json.mock.calls[0][0].data).toBe(42);
    });

    test("không thêm data field khi data=undefined", () => {
      const { sendSuccess } = require("../kernels/middlewares/errorHandler");
      const res = mockRes();
      sendSuccess(res, 200, "ok");
      const payload = res.json.mock.calls[0][0];
      expect(payload.data).toBeUndefined();
      expect(payload.message).toBe("ok");
    });

    test("thêm trace_id khi res.locals.traceId có", () => {
      const { sendSuccess } = require("../kernels/middlewares/errorHandler");
      const res = mockRes("tid-999");
      sendSuccess(res, 201, "created");
      expect(res.json.mock.calls[0][0].trace_id).toBe("tid-999");
    });

    test("gọi validateOutgoingEnvelope khi VALIDATE_API_RESPONSES=1 và schema khớp", () => {
      jest.resetModules();
      process.env.VALIDATE_API_RESPONSES = "1";
      jest.mock("../kernels/logging/appLogger", () => ({ logError: jest.fn() }));
      const { sendSuccess } = require("../kernels/middlewares/errorHandler");
      const { logError: logErrFn } = require("../kernels/logging/appLogger");

      const schemaOk = { safeParse: jest.fn().mockReturnValue({ success: true }) };
      const res = mockRes();
      sendSuccess(res, 200, "ok", { x: 1 }, schemaOk);
      expect(schemaOk.safeParse).toHaveBeenCalled();
      expect(logErrFn).not.toHaveBeenCalled();

      delete process.env.VALIDATE_API_RESPONSES;
    });

    test("log lỗi khi VALIDATE_API_RESPONSES=1 và schema không khớp", () => {
      jest.resetModules();
      process.env.VALIDATE_API_RESPONSES = "1";
      jest.mock("../kernels/logging/appLogger", () => ({ logError: jest.fn() }));
      const { sendSuccess } = require("../kernels/middlewares/errorHandler");
      const { logError: logErrFn } = require("../kernels/logging/appLogger");

      const fakeError = { flatten: jest.fn().mockReturnValue({ fieldErrors: {} }) };
      const schemaFail = { safeParse: jest.fn().mockReturnValue({ success: false, error: fakeError }) };
      const res = mockRes();
      sendSuccess(res, 200, "ok", { x: 1 }, schemaFail);
      expect(logErrFn).toHaveBeenCalled();

      delete process.env.VALIDATE_API_RESPONSES;
    });
  });

  describe("notFoundHandler", () => {
    test("trả về 404 với path và message chuẩn", () => {
      const { notFoundHandler } = require("../kernels/middlewares/errorHandler");
      const req = { originalUrl: "/api/no-such-route" };
      const res = mockRes();
      notFoundHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(404);
      const payload = res.json.mock.calls[0][0];
      expect(payload.path).toBe("/api/no-such-route");
      expect(payload.error.code).toBe("NOT_FOUND");
    });
  });

  describe("errorHandler middleware", () => {
    test("nếu headers đã gửi, gọi next(err) và không ghi response", () => {
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("already sent");
      const req = {};
      const res = { headersSent: true, locals: {}, status: jest.fn(), json: jest.fn() };
      const next = jest.fn();
      errorHandler(err, req, res, next);
      expect(next).toHaveBeenCalledWith(err);
      expect(res.status).not.toHaveBeenCalled();
    });

    test("dùng err.statusCode cho HTTP status", () => {
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("not found");
      err.statusCode = 404;
      const res = mockRes();
      const next = jest.fn();
      errorHandler(err, {}, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test("prefix CORS: → ép status 403", () => {
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("CORS: not allowed");
      const res = mockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test("status ngoài [400-599] → fallback 500", () => {
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("weird");
      err.statusCode = 999;
      const res = mockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(500);
    });

    test("trong môi trường dev (NODE_ENV=test): hiển thị message gốc", () => {
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("real dev error");
      err.statusCode = 500;
      const res = mockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.json.mock.calls[0][0].message).toBe("real dev error");
    });

    test("trong production: ẩn message 5xx → 'Lỗi server. Vui lòng thử lại sau.'", () => {
      jest.resetModules();
      process.env.NODE_ENV = "production";
      jest.mock("../kernels/logging/appLogger", () => ({ logError: jest.fn() }));
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("sensitive db info");
      err.statusCode = 500;
      const res = mockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.json.mock.calls[0][0].message).toBe("Lỗi server. Vui lòng thử lại sau.");
      process.env.NODE_ENV = "test";
    });

    test("trong production: 4xx vẫn giữ message gốc", () => {
      jest.resetModules();
      process.env.NODE_ENV = "production";
      jest.mock("../kernels/logging/appLogger", () => ({ logError: jest.fn() }));
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("bad request detail");
      err.statusCode = 400;
      const res = mockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.json.mock.calls[0][0].message).toBe("bad request detail");
      process.env.NODE_ENV = "test";
    });

    test("dùng err.code làm error.code trong response", () => {
      const { errorHandler } = require("../kernels/middlewares/errorHandler");
      const err = new Error("msg");
      err.statusCode = 400;
      err.code = "MY_CODE";
      const res = mockRes();
      errorHandler(err, {}, res, jest.fn());
      expect(res.json.mock.calls[0][0].error.code).toBe("MY_CODE");
    });
  });

  describe("asyncHandler", () => {
    test("gọi next(err) khi async fn reject", async () => {
      const { asyncHandler } = require("../kernels/middlewares/errorHandler");
      const boom = new Error("async boom");
      const fn = asyncHandler(async () => { throw boom; });
      const next = jest.fn();
      await fn({}, {}, next);
      expect(next).toHaveBeenCalledWith(boom);
    });

    test("không gọi next khi async fn resolve bình thường", async () => {
      const { asyncHandler } = require("../kernels/middlewares/errorHandler");
      const fn = asyncHandler(async (req, res) => { res.done = true; });
      const res = { done: false };
      const next = jest.fn();
      await fn({}, res, next);
      expect(res.done).toBe(true);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
