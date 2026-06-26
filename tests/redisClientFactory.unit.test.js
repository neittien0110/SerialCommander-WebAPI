process.env.NODE_ENV = "test";

afterEach(() => {
  jest.clearAllMocks();
  jest.resetModules();
});

describe("redisClientFactory — createRedisClient", () => {
  test("trả {client: null, mode: 'none'} khi url rỗng/không đặt", () => {
    jest.resetModules();
    jest.doMock("../kernels/logging/appLogger", () => ({ logWarn: jest.fn(), logInfo: jest.fn() }));
    const { createRedisClient } = require("../kernels/redis/redisClientFactory");
    expect(createRedisClient({ url: "", label: "test" })).toEqual({ client: null, mode: "none" });
    expect(createRedisClient({ url: null, label: "test" })).toEqual({ client: null, mode: "none" });
    expect(createRedisClient({ url: undefined, label: "test" })).toEqual({ client: null, mode: "none" });
  });

  test("trả {client, mode: 'redis'} khi ioredis khả dụng", () => {
    jest.resetModules();
    jest.doMock("../kernels/logging/appLogger", () => ({ logWarn: jest.fn(), logInfo: jest.fn() }));

    const mockRedisInstance = { on: jest.fn() };
    jest.doMock("ioredis", () => jest.fn().mockImplementation(() => mockRedisInstance));

    const { createRedisClient } = require("../kernels/redis/redisClientFactory");
    const result = createRedisClient({ url: "redis://localhost:6379", label: "test" });

    expect(result.mode).toBe("redis");
    expect(result.client).toBe(mockRedisInstance);
  });

  test("error event: logWarn lần đầu, bỏ qua lần tiếp theo", () => {
    jest.resetModules();
    const mockLogWarn = jest.fn();
    jest.doMock("../kernels/logging/appLogger", () => ({ logWarn: mockLogWarn, logInfo: jest.fn() }));

    const eventHandlers = {};
    const mockRedisInstance = {
      on: jest.fn().mockImplementation((event, cb) => { eventHandlers[event] = cb; }),
    };
    jest.doMock("ioredis", () => jest.fn().mockImplementation(() => mockRedisInstance));

    const { createRedisClient } = require("../kernels/redis/redisClientFactory");
    createRedisClient({ url: "redis://localhost:6379", label: "err-test" });

    eventHandlers.error(new Error("ECONNREFUSED"));
    eventHandlers.error(new Error("ECONNREFUSED again"));

    expect(mockLogWarn).toHaveBeenCalledTimes(1);
    expect(mockLogWarn).toHaveBeenCalledWith("[redis:err-test] connection error", expect.any(Object));
  });

  test("connect event: logInfo được gọi", () => {
    jest.resetModules();
    const mockLogInfo = jest.fn();
    jest.doMock("../kernels/logging/appLogger", () => ({ logWarn: jest.fn(), logInfo: mockLogInfo }));

    const eventHandlers = {};
    const mockRedisInstance = {
      on: jest.fn().mockImplementation((event, cb) => { eventHandlers[event] = cb; }),
    };
    jest.doMock("ioredis", () => jest.fn().mockImplementation(() => mockRedisInstance));

    const { createRedisClient } = require("../kernels/redis/redisClientFactory");
    createRedisClient({ url: "redis://localhost:6379", label: "conn-test" });

    eventHandlers.connect();
    expect(mockLogInfo).toHaveBeenCalledWith("[redis:conn-test] connected");
  });

  test("trả {client: null, mode: 'unavailable'} khi ioredis không cài được", () => {
    jest.resetModules();
    const mockLogWarn = jest.fn();
    jest.doMock("../kernels/logging/appLogger", () => ({ logWarn: mockLogWarn, logInfo: jest.fn() }));
    jest.doMock("ioredis", () => { throw new Error("Cannot find module 'ioredis'"); });

    const { createRedisClient } = require("../kernels/redis/redisClientFactory");
    const result = createRedisClient({ url: "redis://localhost:6379", label: "missing" });

    expect(result).toEqual({ client: null, mode: "unavailable" });
    expect(mockLogWarn).toHaveBeenCalledWith("[redis:missing] ioredis unavailable", expect.any(Object));
  });
});
