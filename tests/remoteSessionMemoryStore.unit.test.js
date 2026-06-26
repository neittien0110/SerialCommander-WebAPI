jest.mock("../kernels/logging/appLogger", () => ({ logError: jest.fn() }));

const { logError } = require("../kernels/logging/appLogger");
const store = require("../kernels/remoteSession/remoteSessionMemoryStore");

beforeEach(() => {
  jest.clearAllMocks();
  store.MEMORY_STORE.clear();
  delete process.env.REMOTE_SESSION_TTL_SECONDS;
  process.env.NODE_ENV = "test";
});

afterAll(() => { process.env.NODE_ENV = "test"; });

describe("throwIfProductionMemoryFallback", () => {
  test("no-op khi không phải production", () => {
    process.env.NODE_ENV = "development";
    expect(() => store.throwIfProductionMemoryFallback("test-op", null)).not.toThrow();
    expect(logError).not.toHaveBeenCalled();
  });

  test("production → logError và throw", () => {
    process.env.NODE_ENV = "production";
    const err = new Error("redis down");
    expect(() => store.throwIfProductionMemoryFallback("saveSession", err))
      .toThrow(expect.objectContaining({ message: expect.stringContaining("in-memory fallback disabled in production") }));
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("CRITICAL: saveSession"));
    process.env.NODE_ENV = "test";
  });

  test("production + err=null → throw với 'unknown'", () => {
    process.env.NODE_ENV = "production";
    expect(() => store.throwIfProductionMemoryFallback("op", null)).toThrow();
    process.env.NODE_ENV = "test";
  });
});

describe("ttlSeconds", () => {
  test("mặc định trả DEFAULT_TTL_SECONDS (7200)", () => {
    expect(store.ttlSeconds()).toBe(store.DEFAULT_TTL_SECONDS);
  });

  test("dùng REMOTE_SESSION_TTL_SECONDS nếu > 60", () => {
    process.env.REMOTE_SESSION_TTL_SECONDS = "3600";
    expect(store.ttlSeconds()).toBe(3600);
  });

  test("fallback DEFAULT nếu value <= 60", () => {
    process.env.REMOTE_SESSION_TTL_SECONDS = "30";
    expect(store.ttlSeconds()).toBe(store.DEFAULT_TTL_SECONDS);
  });

  test("fallback DEFAULT nếu không phải số", () => {
    process.env.REMOTE_SESSION_TTL_SECONDS = "bad";
    expect(store.ttlSeconds()).toBe(store.DEFAULT_TTL_SECONDS);
  });
});

describe("memoryKey", () => {
  test("trả key đúng format", () => {
    expect(store.memoryKey("abc123")).toBe("remote:session:abc123");
  });
});

describe("pruneMemoryStore", () => {
  test("xóa entry đã hết hạn", () => {
    store.MEMORY_STORE.set("k1", { expiresAtMs: Date.now() - 1000 });
    store.MEMORY_STORE.set("k2", { expiresAtMs: Date.now() + 10000 });
    store.pruneMemoryStore();
    expect(store.MEMORY_STORE.has("k1")).toBe(false);
    expect(store.MEMORY_STORE.has("k2")).toBe(true);
  });

  test("giữ nguyên nếu store rỗng", () => {
    expect(() => store.pruneMemoryStore()).not.toThrow();
    expect(store.MEMORY_STORE.size).toBe(0);
  });
});
