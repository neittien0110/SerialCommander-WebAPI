process.env.NODE_ENV = "test";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  jest.resetModules();
});

describe("uploadMiddleware — maxBytes", () => {
  test("mặc định 5MB khi UPLOAD_IMAGE_MAX_MB không đặt", () => {
    delete process.env.UPLOAD_IMAGE_MAX_MB;
    jest.resetModules();
    const { maxBytes } = require("../kernels/middlewares/uploadMiddleware");
    expect(maxBytes()).toBe(5 * 1024 * 1024);
  });

  test("dùng UPLOAD_IMAGE_MAX_MB khi được đặt", () => {
    process.env.UPLOAD_IMAGE_MAX_MB = "10";
    jest.resetModules();
    const { maxBytes } = require("../kernels/middlewares/uploadMiddleware");
    expect(maxBytes()).toBe(10 * 1024 * 1024);
  });

  test("fallback 5MB khi UPLOAD_IMAGE_MAX_MB=0 (không hợp lệ)", () => {
    process.env.UPLOAD_IMAGE_MAX_MB = "0";
    jest.resetModules();
    const { maxBytes } = require("../kernels/middlewares/uploadMiddleware");
    expect(maxBytes()).toBe(5 * 1024 * 1024);
  });

  test("fallback 5MB khi UPLOAD_IMAGE_MAX_MB=NaN", () => {
    process.env.UPLOAD_IMAGE_MAX_MB = "abc";
    jest.resetModules();
    const { maxBytes } = require("../kernels/middlewares/uploadMiddleware");
    expect(maxBytes()).toBe(5 * 1024 * 1024);
  });
});

describe("uploadMiddleware — fileFilter", () => {
  function getFileFilter() {
    jest.resetModules();
    // Need to access the internal fileFilter — re-examine via multer mock
    jest.doMock("multer", () => {
      const multerMock = jest.fn().mockImplementation((opts) => {
        multerMock._opts = opts;
        return {};
      });
      multerMock.memoryStorage = jest.fn().mockReturnValue({});
      multerMock.MulterError = class MulterError extends Error {
        constructor(code, field) { super(code); this.code = code; this.field = field; }
      };
      return multerMock;
    });
    require("../kernels/middlewares/uploadMiddleware");
    const multer = require("multer");
    return multer._opts.fileFilter;
  }

  test("cb(null, true) cho mimetype được phép (image/jpeg)", () => {
    const fileFilter = getFileFilter();
    const cb = jest.fn();
    fileFilter({}, { mimetype: "image/jpeg" }, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  test("cb(MulterError, false) cho mimetype không được phép", () => {
    const fileFilter = getFileFilter();
    const cb = jest.fn();
    fileFilter({}, { mimetype: "application/pdf", fieldname: "file" }, cb);
    const [err, allow] = cb.mock.calls[0];
    expect(err).toBeTruthy();
    expect(allow).toBe(false);
    expect(err.message).toContain("application/pdf");
  });
});
