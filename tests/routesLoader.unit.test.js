process.env.NODE_ENV = "test";

// Mocks for inline require() calls inside /health handler
const mockAuthenticate = jest.fn().mockResolvedValue(undefined);
jest.mock("../models", () => ({ sequelize: { authenticate: mockAuthenticate } }));

const mockIsFirebaseReady = jest.fn().mockReturnValue(true);
const mockGetFirestore = jest.fn();
jest.mock("../kernels/firebaseAdmin", () => ({
  isFirebaseReady: mockIsFirebaseReady,
  getFirestore: mockGetFirestore,
}));

const mockPasswdFilePath = jest.fn().mockReturnValue("/mqtt/passwd");
jest.mock("../kernels/remoteSession/mosquittoPasswdSync", () => ({
  passwdFilePath: mockPasswdFilePath,
}));

const mockAccessSync = jest.fn();
jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  accessSync: mockAccessSync,
  constants: { R_OK: 4, W_OK: 2 },
}));

const mockIoRedis = jest.fn();
jest.mock("ioredis", () => mockIoRedis);

// ────────────────────────────────────────────────────────────────────────────

const { configureRoutes } = require("../kernels/loaders/routesLoader");

function makeDeps(overrides = {}) {
  return {
    scenarioRoutes: jest.fn(),
    adminRoutes: jest.fn(),
    swaggerUIServe: jest.fn(),
    swaggerUISetup: jest.fn(),
    authRoutes: jest.fn(),
    userRoutes: jest.fn(),
    uploadRoutes: jest.fn(),
    remoteRoutes: jest.fn(),
    youtubeRoutes: jest.fn(),
    sendSuccess: jest.fn(),
    notFoundHandler: jest.fn(),
    errorHandler: jest.fn(),
    ...overrides,
  };
}

function buildApp() {
  const handlers = {};
  return {
    get: jest.fn().mockImplementation((route, fn) => { handlers[route] = fn; }),
    use: jest.fn(),
    _handlers: handlers,
  };
}

function makeRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
}

afterAll(() => jest.clearAllTimers());

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.RATE_LIMIT_REDIS_URL;
  delete process.env.SCENARIO_OUTBOX_REDIS_URL;
  delete process.env.REMOTE_SESSION_REDIS_URL;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  delete process.env.MQTT_PASSWD_FILE;
});

// ── configureRoutes registers all routes ─────────────────────────────────────

describe("configureRoutes — route registration", () => {
  test("đăng ký GET /health và GET /", () => {
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    expect(app.get).toHaveBeenCalledWith("/health", expect.any(Function));
    expect(app.get).toHaveBeenCalledWith("/", expect.any(Function));
  });

  test("đăng ký tất cả middleware + error handlers", () => {
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    expect(app.use).toHaveBeenCalled();
  });

  test("GET / trả 200 với version info", () => {
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    const rootHandler = app._handlers["/"];
    rootHandler({}, {});
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, "Serial Commander API Server",
      expect.objectContaining({ version: "1.0.0" })
    );
  });
});

// ── /health: happy path ───────────────────────────────────────────────────────

describe("/health — happy path", () => {
  test("trả 200 khi chỉ DB OK, không redis/firebase/mqtt", async () => {
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    const handler = app._handlers["/health"];
    await handler({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, "Serial Commander API healthy",
      expect.objectContaining({ status: "ok", db: "ok" })
    );
  });
});

// ── /health: DB error branch ──────────────────────────────────────────────────

describe("/health — DB fail", () => {
  test("trả 503 khi sequelize.authenticate() throw", async () => {
    mockAuthenticate.mockRejectedValueOnce(new Error("connection refused"));
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 503, "API degraded — database unreachable",
      expect.objectContaining({ status: "degraded", db: "fail" })
    );
  });
});

// ── /health: Redis branches ───────────────────────────────────────────────────

describe("/health — Redis", () => {
  function makeRedisMock(ok = true) {
    const instance = {
      connect: jest.fn().mockResolvedValue(undefined),
      ping: jest.fn().mockResolvedValue("PONG"),
      quit: jest.fn().mockResolvedValue(undefined),
    };
    if (!ok) {
      instance.connect.mockRejectedValue(new Error("redis down"));
    }
    mockIoRedis.mockReturnValue(instance);
    return instance;
  }

  test("trả 200 khi redis URL set và redis OK", async () => {
    process.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379";
    makeRedisMock(true);
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ redis: "ok" })
    );
  });

  test("trả 503 khi redis connect fail", async () => {
    process.env.RATE_LIMIT_REDIS_URL = "redis://localhost:6379";
    makeRedisMock(false);
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 503, "API degraded — redis unreachable",
      expect.objectContaining({ redis: "fail" })
    );
  });
});

// ── /health: Firebase branches ────────────────────────────────────────────────

describe("/health — Firebase", () => {
  beforeEach(() => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "/path/to/key.json";
  });

  test("trả 503 khi isFirebaseReady() false", async () => {
    mockIsFirebaseReady.mockReturnValue(false);
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 503, "API degraded — firebase unreachable",
      expect.objectContaining({ firebase: "fail" })
    );
  });

  test("trả 503 khi getFirestore() trả null", async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockGetFirestore.mockReturnValue(null);
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 503, "API degraded — firebase unreachable",
      expect.objectContaining({ firebase: "fail" })
    );
  });

  test("trả 200 khi firebase OK", async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockGetFirestore.mockReturnValue({ listCollections: jest.fn().mockResolvedValue([]) });
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ firebase: "ok" })
    );
  });

  test("trả 503 khi firestore.listCollections throw", async () => {
    mockIsFirebaseReady.mockReturnValue(true);
    mockGetFirestore.mockReturnValue({ listCollections: jest.fn().mockRejectedValue(new Error("timeout")) });
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 503, "API degraded — firebase unreachable",
      expect.objectContaining({ firebase: "fail" })
    );
  });
});

// ── /health: MQTT branches ────────────────────────────────────────────────────

describe("/health — MQTT", () => {
  beforeEach(() => {
    process.env.MQTT_PASSWD_FILE = "/mqtt/passwd";
  });

  test("trả 200 khi mqttDir accessible", async () => {
    mockPasswdFilePath.mockReturnValue("/mqtt/passwd");
    mockAccessSync.mockReturnValue(undefined); // no throw = success
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ mqtt: "ok" })
    );
  });

  test("trả 503 khi passwdFilePath() trả null", async () => {
    mockPasswdFilePath.mockReturnValue(null);
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 503, "API degraded — mqtt passwd sync unavailable",
      expect.objectContaining({ mqtt: "fail" })
    );
  });

  test("trả 503 khi fs.accessSync throw", async () => {
    mockPasswdFilePath.mockReturnValue("/mqtt/passwd");
    mockAccessSync.mockImplementation(() => { throw new Error("permission denied"); });
    const app = buildApp();
    const deps = makeDeps();
    configureRoutes(app, deps);
    await app._handlers["/health"]({}, makeRes());
    expect(deps.sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 503, "API degraded — mqtt passwd sync unavailable",
      expect.objectContaining({ mqtt: "fail" })
    );
  });
});
