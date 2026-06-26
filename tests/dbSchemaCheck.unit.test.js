process.env.NODE_ENV = "test";

jest.mock("../config/schemaRegistry", () => ({ EXPECTED_SCHEMA_VERSION: 14 }));
jest.mock("../kernels/logging/appLogger", () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));

const { QueryTypes } = require("sequelize");
const { checkSchemaVersion } = require("../kernels/dbSchemaCheck");
const { logInfo, logWarn, logError } = require("../kernels/logging/appLogger");

function makeSeq(rows) {
  return { query: jest.fn().mockResolvedValue(rows) };
}

function makeSeqThrow(err) {
  return { query: jest.fn().mockRejectedValue(err) };
}

beforeEach(() => jest.clearAllMocks());

describe("checkSchemaVersion — empty/missing registry", () => {
  test("rows rỗng → ok=false, reason=empty_registry", async () => {
    const result = await checkSchemaVersion(makeSeq([]));
    expect(result).toEqual({ ok: false, reason: "empty_registry" });
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("app_schema_registry trống"));
  });

  test("row.v = null → ok=false, reason=empty_registry", async () => {
    const result = await checkSchemaVersion(makeSeq([{ v: null }]));
    expect(result).toEqual({ ok: false, reason: "empty_registry" });
  });

  test("row.v = undefined → ok=false, reason=empty_registry", async () => {
    const result = await checkSchemaVersion(makeSeq([{}]));
    expect(result).toEqual({ ok: false, reason: "empty_registry" });
  });
});

describe("checkSchemaVersion — invalid version", () => {
  test("row.v = 'NaN' → ok=false, reason=invalid_version", async () => {
    const result = await checkSchemaVersion(makeSeq([{ v: "not-a-number" }]));
    expect(result).toEqual({ ok: false, reason: "invalid_version" });
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("schema_version không hợp lệ"));
  });
});

describe("checkSchemaVersion — version behind", () => {
  test("dbVersion < EXPECTED → ok=false, reason=behind, logError", async () => {
    const result = await checkSchemaVersion(makeSeq([{ v: 10 }]));
    expect(result).toMatchObject({ ok: false, reason: "behind", dbVersion: 10 });
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("Schema DB (10) lệch mã nguồn"));
  });
});

describe("checkSchemaVersion — version ahead", () => {
  test("dbVersion > EXPECTED → ok=true + logWarn ahead", async () => {
    const result = await checkSchemaVersion(makeSeq([{ v: 20 }]));
    expect(result).toMatchObject({ ok: true, dbVersion: 20 });
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("Schema DB (20) mới hơn mã nguồn"));
  });
});

describe("checkSchemaVersion — version exact match", () => {
  test("dbVersion === EXPECTED → ok=true + logInfo OK", async () => {
    const result = await checkSchemaVersion(makeSeq([{ v: 14 }]));
    expect(result).toMatchObject({ ok: true, dbVersion: 14 });
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining("Schema registry OK (version 14)"));
  });
});

describe("checkSchemaCheck — error handling", () => {
  test("table doesn't exist → ok=false, reason=no_registry_table", async () => {
    const err = new Error("Table 'x.app_schema_registry' doesn't exist");
    const result = await checkSchemaVersion(makeSeqThrow(err));
    expect(result).toEqual({ ok: false, reason: "no_registry_table" });
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining("Chưa có bảng app_schema_registry"));
  });

  test("ER_NO_SUCH_TABLE in sqlMessage → no_registry_table", async () => {
    const err = new Error("ER_NO_SUCH_TABLE: Table 'x' doesn't exist");
    err.parent = { sqlMessage: "Table 'x' doesn't exist (ER_NO_SUCH_TABLE)" };
    const result = await checkSchemaVersion(makeSeqThrow(err));
    expect(result).toEqual({ ok: false, reason: "no_registry_table" });
  });

  test("generic query error → ok=false, reason=query_error", async () => {
    const err = new Error("connection refused");
    const result = await checkSchemaVersion(makeSeqThrow(err));
    expect(result).toMatchObject({ ok: false, reason: "query_error" });
    expect(logWarn).toHaveBeenCalledWith(
      expect.stringContaining("Không kiểm tra được schema_version:"),
      expect.objectContaining({ detail: "connection refused" })
    );
  });
});
