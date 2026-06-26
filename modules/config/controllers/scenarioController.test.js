process.env.NODE_ENV = "test";

jest.mock("../services/scenarioService", () => ({
  createScenario: jest.fn(),
  verifyScenario: jest.fn().mockReturnValue({ ok: true }),
  updateScenario: jest.fn(),
  deleteScenario: jest.fn(),
  isShareCodeAvailable: jest.fn(),
  getScenarioByShareCode: jest.fn(),
  getPublicScenarios: jest.fn(),
  getScenariosByUserId: jest.fn(),
  shareScenario: jest.fn(),
  PUBLIC_SCENARIO_SORT_KEYS: ["name", "createdAt", "updatedAt"],
}));
jest.mock("../services/scenarioDraftShareService", () => ({
  createDraftShare: jest.fn(),
  getDraftShareContent: jest.fn(),
}));
jest.mock("../services/scenarioFileValidator", () => ({
  validateScenarioFile: jest.fn().mockReturnValue({ errors: [], warnings: [] }),
}));
jest.mock("../../../kernels/logging/appLogger", () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));
jest.mock("../../../kernels/validations/responseSchemas", () => ({
  scenarioMergedResourceSuccessSchema: "merged-schema",
  scenarioListEnvelopeSchema: "list-schema",
}));
jest.mock("../../../kernels/middlewares/errorHandler", () => ({
  sendError: jest.fn(),
  sendSuccess: jest.fn(),
}));
jest.mock("../services/scenarioPresenter", () => ({
  mapScenarioOutput: jest.fn().mockImplementation((r) => ({ ...r, mapped: true })),
  mapScenarioFromMaybeDataValues: jest.fn().mockImplementation((r) => r),
  mapScenarioForExport: jest.fn().mockImplementation((r) => ({ content: r.Content || [] })),
}));

const ctrl = require("./scenarioController");
const scenarioService = require("../services/scenarioService");
const draftShareService = require("../services/scenarioDraftShareService");
const { sendError, sendSuccess } = require("../../../kernels/middlewares/errorHandler");
const { logError, logWarn } = require("../../../kernels/logging/appLogger");

function makeReq(overrides = {}) {
  return {
    user: { id: 42 },
    params: {},
    query: {},
    body: {},
    ...overrides,
  };
}
function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };
}

beforeEach(() => jest.clearAllMocks());

// ── respondScenarioError ───────────────────────────────────────────────────────

describe("respondScenarioError — via error paths", () => {
  test("404 error → logWarn (không logError)", async () => {
    const err = Object.assign(new Error("not found"), { statusCode: 404, code: "NOT_FOUND" });
    scenarioService.getScenarioById = jest.fn().mockRejectedValue(err);
    await ctrl.getScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(logWarn).toHaveBeenCalledWith("scenario route not found", expect.any(Object));
    expect(logError).not.toHaveBeenCalled();
  });

  test("non-404 error → logError", async () => {
    const err = Object.assign(new Error("db crash"), { statusCode: 500, code: "DB_ERROR" });
    scenarioService.getScenarioById = jest.fn().mockRejectedValue(err);
    await ctrl.getScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(logError).toHaveBeenCalledWith("scenario route error", expect.any(Object));
  });
});

// ── createScenario ─────────────────────────────────────────────────────────────

describe("createScenario", () => {
  test("syncStatus=pending → 202 success", async () => {
    scenarioService.createScenario.mockResolvedValue({ id: 1, syncStatus: "pending" });
    await ctrl.createScenario(makeReq({ body: { Name: "test" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 202,
      expect.stringContaining("đồng bộ nội dung lên Firestore"),
      expect.objectContaining({ syncStatus: "pending" })
    );
  });

  test("syncStatus=degraded → 202 success với message degraded", async () => {
    scenarioService.createScenario.mockResolvedValue({ id: 1, syncStatus: "degraded" });
    await ctrl.createScenario(makeReq({ body: {} }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 202,
      expect.stringContaining("Đồng bộ Firestore tạm gián đoạn"),
      expect.any(Object)
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("fail"), { statusCode: 500 });
    scenarioService.createScenario.mockRejectedValue(err);
    await ctrl.createScenario(makeReq(), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 500, "fail", "SCENARIO_CREATE_FAILED");
  });
});

// ── updateScenario ─────────────────────────────────────────────────────────────

describe("updateScenario", () => {
  test("syncStatus=pending → 202", async () => {
    scenarioService.updateScenario.mockResolvedValue({ syncStatus: "pending" });
    await ctrl.updateScenario(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 202,
      expect.stringContaining("Firestore"),
      expect.objectContaining({ scenarioId: "s1" })
    );
  });

  test("syncStatus=degraded → 202 với message degraded", async () => {
    scenarioService.updateScenario.mockResolvedValue({ syncStatus: "degraded" });
    await ctrl.updateScenario(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 202,
      expect.stringContaining("tạm gián đoạn"),
      expect.any(Object)
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("update fail"), { statusCode: 400 });
    scenarioService.updateScenario.mockRejectedValue(err);
    await ctrl.updateScenario(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, "update fail", "SCENARIO_UPDATE_FAILED");
  });
});

// ── deleteScenario ─────────────────────────────────────────────────────────────

describe("deleteScenario", () => {
  test("syncStatus=pending → 202", async () => {
    scenarioService.deleteScenario.mockResolvedValue({ syncStatus: "pending" });
    await ctrl.deleteScenario(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 202,
      expect.stringContaining("xóa"),
      expect.objectContaining({ scenarioId: "s1" })
    );
  });

  test("syncStatus=degraded → 202 message degraded", async () => {
    scenarioService.deleteScenario.mockResolvedValue({ syncStatus: "degraded" });
    await ctrl.deleteScenario(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 202,
      expect.stringContaining("tạm gián đoạn"),
      expect.any(Object)
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("delete fail"), { statusCode: 403 });
    scenarioService.deleteScenario.mockRejectedValue(err);
    await ctrl.deleteScenario(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 403, "delete fail", "SCENARIO_DELETE_FAILED");
  });
});

// ── getShareAvailability ───────────────────────────────────────────────────────

describe("getShareAvailability", () => {
  test("available=false → 404 sendError", async () => {
    scenarioService.isShareCodeAvailable.mockResolvedValue(false);
    await ctrl.getShareAvailability(makeReq({ params: { shareCode: "abc123" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 404, expect.any(String), "SHARE_CODE_NOT_AVAILABLE");
  });

  test("available=true → 200 sendSuccess", async () => {
    scenarioService.isShareCodeAvailable.mockResolvedValue(true);
    await ctrl.getShareAvailability(makeReq({ params: { shareCode: "abc123" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ available: true, shareCode: "abc123" })
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("db error"), { statusCode: 500 });
    scenarioService.isShareCodeAvailable.mockRejectedValue(err);
    await ctrl.getShareAvailability(makeReq({ params: { shareCode: "abc123" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 500, "db error", "SHARE_AVAILABILITY_FAILED");
  });
});

// ── getPublicScenarios ─────────────────────────────────────────────────────────

describe("getPublicScenarios", () => {
  test("invalid limit → 400", async () => {
    await ctrl.getPublicScenarios(makeReq({ query: { limit: "999" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "SCENARIO_PUBLIC_LIST_INVALID_LIMIT");
  });

  test("invalid offset → 400", async () => {
    await ctrl.getPublicScenarios(makeReq({ query: { offset: "-5" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "SCENARIO_PUBLIC_LIST_INVALID_OFFSET");
  });

  test("invalid sort → 400", async () => {
    await ctrl.getPublicScenarios(makeReq({ query: { sort: "evil_sort" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "SCENARIO_PUBLIC_LIST_INVALID_SORT");
  });

  test("search > 200 chars → 400", async () => {
    await ctrl.getPublicScenarios(makeReq({ query: { search: "x".repeat(201) } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "SCENARIO_PUBLIC_LIST_INVALID_SEARCH");
  });

  test("success → 200 với pagination", async () => {
    scenarioService.getPublicScenarios.mockResolvedValue({
      scenarios: [{ id: 1 }], total: 1, limit: 20, offset: 0,
    });
    await ctrl.getPublicScenarios(makeReq({ query: {} }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ pagination: expect.objectContaining({ total: 1 }) })
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("db error"), { statusCode: 500 });
    scenarioService.getPublicScenarios.mockRejectedValue(err);
    await ctrl.getPublicScenarios(makeReq({ query: {} }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 500, "db error", "SCENARIO_PUBLIC_LIST_FAILED");
  });
});

// ── createDraftShare ───────────────────────────────────────────────────────────

describe("createDraftShare", () => {
  test("empty content → 400", async () => {
    await ctrl.createDraftShare(makeReq({ body: "   " }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, "Nội dung draft trống.", "DRAFT_SHARE_EMPTY");
  });

  test("invalid JSON → 400", async () => {
    await ctrl.createDraftShare(makeReq({ body: "not-json{{" }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, "Nội dung draft không phải JSON hợp lệ.", "DRAFT_SHARE_INVALID_JSON");
  });

  test("success → 201 với code", async () => {
    draftShareService.createDraftShare.mockResolvedValue({ code: "abc123" });
    await ctrl.createDraftShare(makeReq({ body: JSON.stringify({ k: 1 }) }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), 201, expect.any(String), { code: "abc123" });
  });

  test("service error → respondScenarioError", async () => {
    const err = Object.assign(new Error("svc fail"), { statusCode: 503 });
    draftShareService.createDraftShare.mockRejectedValue(err);
    await ctrl.createDraftShare(makeReq({ body: JSON.stringify({ k: 1 }) }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 503, "svc fail", "DRAFT_SHARE_CREATE_FAILED");
  });
});

// ── getScenarioById ────────────────────────────────────────────────────────────

describe("getScenarioById", () => {
  test("success → 200 với mapped output", async () => {
    scenarioService.getScenarioById = jest.fn().mockResolvedValue({ id: 1, Name: "test" });
    await ctrl.getScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ mapped: true }),
      "merged-schema"
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("not found"), { statusCode: 404 });
    scenarioService.getScenarioById = jest.fn().mockRejectedValue(err);
    await ctrl.getScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 404, "not found", "SCENARIO_GET_FAILED");
  });
});

// ── exportScenarioById ─────────────────────────────────────────────────────────

describe("exportScenarioById", () => {
  test("success → setHeader + 200 sendSuccess", async () => {
    scenarioService.getScenarioById = jest.fn().mockResolvedValue({ id: 1, Name: "My Scenario", Content: [] });
    const res = makeRes();
    await ctrl.exportScenarioById(makeReq({ params: { scenarioId: "s1" } }), res);
    expect(res.setHeader).toHaveBeenCalledWith("Content-Disposition", expect.stringContaining("My%20Scenario.json"));
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ content: [] }),
      "merged-schema"
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("export fail"), { statusCode: 404 });
    scenarioService.getScenarioById = jest.fn().mockRejectedValue(err);
    await ctrl.exportScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 404, "export fail", "SCENARIO_EXPORT_FAILED");
  });
});

// ── getScenariosByUserId ───────────────────────────────────────────────────────

describe("getScenariosByUserId", () => {
  test("legacy_array=1 → res.status(200).json(scenarios)", async () => {
    scenarioService.getScenariosByUserId.mockResolvedValue({
      scenarios: [{ id: 1 }], total: 1, limit: 20, offset: 0,
    });
    const res = makeRes();
    await ctrl.getScenariosByUserId(
      makeReq({ query: { legacy_array: "1" } }),
      res
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  test("normal → 200 sendSuccess với pagination", async () => {
    scenarioService.getScenariosByUserId.mockResolvedValue({
      scenarios: [{ id: 1 }], total: 5, limit: 20, offset: 0,
    });
    await ctrl.getScenariosByUserId(makeReq({ query: {} }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ pagination: expect.objectContaining({ total: 5 }) }),
      "list-schema"
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("list fail"), { statusCode: 500 });
    scenarioService.getScenariosByUserId.mockRejectedValue(err);
    await ctrl.getScenariosByUserId(makeReq({ query: {} }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 500, "list fail", "SCENARIO_LIST_FAILED");
  });
});

// ── shareScenarioById ──────────────────────────────────────────────────────────

describe("shareScenarioById", () => {
  test("IsShared=true → 200 với ShareCode", async () => {
    scenarioService.shareScenario.mockResolvedValue({ IsShared: true, ShareCode: "SHARE123" });
    await ctrl.shareScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, "Chia sẻ kịch bản thành công.",
      expect.objectContaining({ ShareCode: "SHARE123", IsShared: true })
    );
  });

  test("IsShared=false → 200 với message ngừng chia sẻ", async () => {
    scenarioService.shareScenario.mockResolvedValue({ IsShared: false });
    await ctrl.shareScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, "Đã ngừng chia sẻ để sử dụng cá nhân.",
      expect.objectContaining({ IsShared: false })
    );
  });

  test("error → respondScenarioError", async () => {
    const err = Object.assign(new Error("share fail"), { statusCode: 500 });
    scenarioService.shareScenario.mockRejectedValue(err);
    await ctrl.shareScenarioById(makeReq({ params: { scenarioId: "s1" } }), makeRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 500, "share fail", "SCENARIO_TOGGLE_SHARE_FAILED");
  });
});
