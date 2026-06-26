process.env.NODE_ENV = "test";

const logErrorFn = jest.fn();

function makeAdminMock(overrides = {}) {
  const mock = {
    apps: [],
    initializeApp: jest.fn(),
    credential: { cert: jest.fn().mockReturnValue("cred-stub") },
    firestore: jest.fn().mockReturnValue({ id: "firestore-stub" }),
    ...overrides,
  };
  return mock;
}

function fresh(adminOverrides = {}, fsOverrides = {}) {
  jest.resetModules();
  const adminMock = makeAdminMock(adminOverrides);

  const fsMock = {
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockReturnValue(JSON.stringify({ project_id: "test-project" })),
    ...fsOverrides,
  };

  jest.doMock("firebase-admin", () => adminMock);
  jest.doMock("fs", () => fsMock);
  jest.doMock("../kernels/logging/appLogger", () => ({ logError: logErrorFn }));

  const mod = require("../kernels/firebaseAdmin");
  return { mod, adminMock, fsMock };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
});

// ── resolveServiceAccountFromEnv (tested via isFirebaseReady) ─────────────────

describe("isFirebaseReady — FIREBASE_SERVICE_ACCOUNT_JSON", () => {
  test("trả false khi không có env", () => {
    const { mod } = fresh();
    expect(mod.isFirebaseReady()).toBe(false);
  });

  test("trả true khi JSON base64 hợp lệ", () => {
    const sa = { project_id: "proj", type: "service_account" };
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(sa)).toString("base64");
    const { mod, adminMock } = fresh();
    expect(mod.isFirebaseReady()).toBe(true);
    expect(adminMock.initializeApp).toHaveBeenCalled();
  });

  test("trả true khi raw JSON string hợp lệ (không phải base64)", () => {
    const sa = { project_id: "proj2", type: "service_account" };
    // "raw" JSON sẽ fail base64 parse (Buffer.from sẽ không throw nhưng JSON.parse sẽ fail)
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(sa);
    const { mod, adminMock } = fresh();
    expect(mod.isFirebaseReady()).toBe(true);
    expect(adminMock.initializeApp).toHaveBeenCalled();
  });

  test("trả false khi env không phải JSON hợp lệ", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "totally-invalid-!!!";
    const { mod } = fresh();
    expect(mod.isFirebaseReady()).toBe(false);
  });
});

// ── resolveServiceAccountPath (tested via isFirebaseReady) ────────────────────

describe("isFirebaseReady — FIREBASE_SERVICE_ACCOUNT_PATH", () => {
  test("trả false khi path env không được set", () => {
    const { mod } = fresh();
    expect(mod.isFirebaseReady()).toBe(false);
  });

  test("trả false khi file không tồn tại", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "/nonexistent/key.json";
    const { mod } = fresh({}, { existsSync: jest.fn().mockReturnValue(false) });
    expect(mod.isFirebaseReady()).toBe(false);
  });

  test("trả true khi file tồn tại và đọc được JSON", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "/abs/path/key.json";
    const { mod, adminMock } = fresh();
    expect(mod.isFirebaseReady()).toBe(true);
    expect(adminMock.initializeApp).toHaveBeenCalled();
  });

  test("trả false và logError khi file tồn tại nhưng không phải JSON", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "/abs/path/key.json";
    const { mod } = fresh({}, { existsSync: jest.fn().mockReturnValue(true), readFileSync: jest.fn().mockReturnValue("not json {{{") });
    expect(mod.isFirebaseReady()).toBe(false);
    expect(logErrorFn).toHaveBeenCalled();
  });

  test("trả false và logError khi Firebase initializeApp throw", () => {
    const sa = { project_id: "proj", type: "service_account" };
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(sa)).toString("base64");
    const { mod } = fresh({ initializeApp: jest.fn().mockImplementation(() => { throw new Error("cert invalid"); }) });
    expect(mod.isFirebaseReady()).toBe(false);
    expect(logErrorFn).toHaveBeenCalled();
  });

  test("dùng relative path → joined với cwd", () => {
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH = "relative/key.json";
    const { mod, fsMock } = fresh();
    mod.isFirebaseReady();
    // existsSync should have been called with an absolute path (cwd + relative)
    const calledPath = fsMock.existsSync.mock.calls[0]?.[0] ?? "";
    expect(path.isAbsolute(calledPath)).toBe(true);
    expect(calledPath).toContain("relative/key.json");
  });
});

// Require path to check isAbsolute in tests above
const path = require("path");

// ── idempotency ───────────────────────────────────────────────────────────────

describe("isFirebaseReady — idempotent (initialized flag)", () => {
  test("second call trả true mà không gọi lại initializeApp", () => {
    const sa = { project_id: "proj", type: "service_account" };
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(sa)).toString("base64");
    const { mod, adminMock } = fresh();
    mod.isFirebaseReady();
    mod.isFirebaseReady();
    expect(adminMock.initializeApp).toHaveBeenCalledTimes(1);
  });
});

// ── getFirestore / getAdmin ───────────────────────────────────────────────────

describe("getFirestore", () => {
  test("trả null khi không initialized", () => {
    const { mod } = fresh();
    expect(mod.getFirestore()).toBeNull();
  });

  test("trả firestore instance khi initialized", () => {
    const sa = { project_id: "p", type: "service_account" };
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(sa)).toString("base64");
    const { mod } = fresh();
    expect(mod.getFirestore()).toBeTruthy();
  });
});

describe("getAdmin", () => {
  test("trả null khi không initialized", () => {
    const { mod } = fresh();
    expect(mod.getAdmin()).toBeNull();
  });

  test("trả admin object khi initialized", () => {
    const sa = { project_id: "p", type: "service_account" };
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(sa)).toString("base64");
    const { mod } = fresh();
    expect(mod.getAdmin()).toBeTruthy();
  });
});
