jest.mock("../../../kernels/middlewares/errorHandler", () => ({
  sendError: jest.fn(),
  sendSuccess: jest.fn(),
}));
jest.mock("../../../models", () => ({
  User: { findByPk: jest.fn() },
}));
jest.mock("../services/remoteSessionService");
jest.mock("../../../kernels/remoteSession/mosquittoPasswdSync");
jest.mock("../../../utils/emailService");
jest.mock("../utils/inviteUrlValidation");

const { sendError, sendSuccess } = require("../../../kernels/middlewares/errorHandler");
const { User } = require("../../../models");
const remoteSessionService = require("../services/remoteSessionService");
const mosquittoPasswdSync = require("../../../kernels/remoteSession/mosquittoPasswdSync");
const { sendSessionInviteEmail } = require("../../../utils/emailService");
const { isAllowedInviteUrl } = require("../utils/inviteUrlValidation");

const ctrl = require("./remoteSessionController");

function mockRes() {
  return { locals: {} };
}

beforeEach(() => {
  jest.clearAllMocks();
  sendError.mockReturnValue(undefined);
  sendSuccess.mockReturnValue(undefined);
});

// ─── createSession ──────────────────────────────────────────────────────────
describe("createSession", () => {
  test("401 khi không có userId", async () => {
    const req = { user: null };
    await ctrl.createSession(req, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 401, expect.any(String), "UNAUTHORIZED");
  });

  test("201 khi tạo thành công (NODE_ENV=test, không cần passwd sync)", async () => {
    const session = { mqttBrokerPasswdSynced: true };
    remoteSessionService.createRemoteSession.mockResolvedValue(session);
    await ctrl.createSession({ user: { id: 1 } }, mockRes());
    expect(sendSuccess).toHaveBeenCalledWith(expect.anything(), 201, expect.any(String), session);
  });

  test("503 khi production + MQTT_PASSWD_FILE đặt + sync thất bại", async () => {
    const ORIG_ENV = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    process.env.MQTT_PASSWD_FILE = "/etc/mosquitto/passwd";
    const session = { mqttBrokerPasswdSynced: false, mqttBrokerPasswdHint: "chưa sync" };
    remoteSessionService.createRemoteSession.mockResolvedValue(session);

    await ctrl.createSession({ user: { id: 1 } }, mockRes());

    expect(sendError).toHaveBeenCalledWith(
      expect.anything(), 503, "chưa sync", "MQTT_BROKER_PASSWD_SYNC_FAILED"
    );

    process.env.NODE_ENV = ORIG_ENV;
    delete process.env.MQTT_PASSWD_FILE;
  });

  test("forward statusCode từ service khi throw", async () => {
    const err = new Error("conflict");
    err.statusCode = 409;
    err.code = "SESSION_EXISTS";
    remoteSessionService.createRemoteSession.mockRejectedValue(err);
    await ctrl.createSession({ user: { id: 1 } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 409, "conflict", "SESSION_EXISTS");
  });

  test("fallback 500 khi error không có statusCode", async () => {
    remoteSessionService.createRemoteSession.mockRejectedValue(new Error("boom"));
    await ctrl.createSession({ user: { id: 1 } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(
      expect.anything(), 500, expect.any(String), "REMOTE_SESSION_CREATE_FAILED"
    );
  });
});

// ─── verifySession ───────────────────────────────────────────────────────────
describe("verifySession", () => {
  test("401 khi không có user", async () => {
    await ctrl.verifySession({ user: null, body: {} }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 401, expect.any(String), "UNAUTHORIZED");
  });

  test("400 khi sessionId không hợp lệ", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue(null);
    await ctrl.verifySession({ user: { id: 1 }, body: { sessionId: "bad" } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "REMOTE_SESSION_INVALID");
  });

  test("404 khi không tìm thấy record", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue(null);
    await ctrl.verifySession({ user: { id: 1 }, body: { sessionId: "abcd1234abcd1234" } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 404, expect.any(String), "REMOTE_ROOM_NOT_FOUND");
  });

  test("401 khi mqttPasswordToken không hợp lệ", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue({ foo: "bar" });
    remoteSessionService.verifyRemoteSession.mockResolvedValue(false);
    await ctrl.verifySession({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234", mqttPasswordToken: "bad-token" },
    }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 401, expect.any(String), "REMOTE_SESSION_INVALID");
  });

  test("200 valid:true khi mqttPasswordToken hợp lệ", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue({ foo: "bar" });
    remoteSessionService.verifyRemoteSession.mockResolvedValue(true);
    await ctrl.verifySession({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234", mqttPasswordToken: "good-token" },
    }, mockRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String), { valid: true }
    );
  });

  test("host refresh path: trả credentials + mqttBrokerPasswdSynced", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    const record = { mqttPasswordToken: "tok" };
    remoteSessionService.getSessionRecord.mockResolvedValue(record);
    remoteSessionService.isSessionHost.mockReturnValue(true);
    remoteSessionService.buildSessionCredentials.mockReturnValue({ mqtt: "creds" });
    mosquittoPasswdSync.ensureMqttBrokerUser.mockResolvedValue({ synced: true, passwdReloaded: true });

    await ctrl.verifySession({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234" }, // no token, no joinChallenge
    }, mockRes());

    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ mqtt: "creds", mqttBrokerPasswdSynced: true })
    );
  });

  test("host refresh: mqttBrokerPasswdHint khi sync thất bại với reason MQTT_PASSWD_FILE", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue({ mqttPasswordToken: "tok" });
    remoteSessionService.isSessionHost.mockReturnValue(true);
    remoteSessionService.buildSessionCredentials.mockReturnValue({});
    mosquittoPasswdSync.ensureMqttBrokerUser.mockResolvedValue({
      synced: false,
      reason: "MQTT_PASSWD_FILE không cấu hình",
    });

    await ctrl.verifySession({
      user: { id: 1 }, body: { sessionId: "abcd1234abcd1234" },
    }, mockRes());

    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ mqttBrokerPasswdHint: expect.stringContaining("MQTT_PASSWD_FILE") })
    );
  });

  test("403 khi station không được authorized", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue({});
    remoteSessionService.isSessionHost.mockReturnValue(false);
    remoteSessionService.isAuthorizedForCredentials.mockReturnValue(false);

    await ctrl.verifySession({
      user: { id: 2 },
      body: { sessionId: "abcd1234abcd1234", joinChallenge: "bad-challenge" },
    }, mockRes());

    expect(sendError).toHaveBeenCalledWith(expect.anything(), 403, expect.any(String), "REMOTE_SESSION_FORBIDDEN");
  });

  test("200 station join: trả stationId + displayName từ DB", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue({ mqttPasswordToken: "tok" });
    remoteSessionService.isSessionHost.mockReturnValue(false);
    remoteSessionService.isAuthorizedForCredentials.mockReturnValue(true);
    remoteSessionService.buildSessionCredentials.mockReturnValue({ mqtt: "creds" });
    remoteSessionService.registerStation.mockResolvedValue("st-0001");
    User.findByPk.mockResolvedValue({ username: "alice", email: "alice@example.com" });
    mosquittoPasswdSync.ensureMqttBrokerUser.mockResolvedValue({ synced: true, passwdReloaded: false });

    await ctrl.verifySession({
      user: { id: 2 },
      body: { sessionId: "abcd1234abcd1234", joinChallenge: "validchallenge0000" },
    }, mockRes());

    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ stationId: "st-0001", displayName: "alice" })
    );
  });

  test("200 station join: mqttBrokerPasswdHint khi sync thất bại với reason khác", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue({ mqttPasswordToken: "tok" });
    remoteSessionService.isSessionHost.mockReturnValue(false);
    remoteSessionService.isAuthorizedForCredentials.mockReturnValue(true);
    remoteSessionService.buildSessionCredentials.mockReturnValue({});
    remoteSessionService.registerStation.mockResolvedValue("st-0003");
    User.findByPk.mockResolvedValue({ username: "carol", email: "carol@example.com" });
    mosquittoPasswdSync.ensureMqttBrokerUser.mockResolvedValue({
      synced: false,
      reason: "write_error",
      error: "EACCES",
    });

    await ctrl.verifySession({
      user: { id: 4 },
      body: { sessionId: "abcd1234abcd1234", joinChallenge: "validchallenge0000" },
    }, mockRes());

    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ mqttBrokerPasswdHint: expect.stringContaining("write_error") })
    );
  });

  test("200 station join: displayName fallback tới email prefix khi username trống", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.getSessionRecord.mockResolvedValue({ mqttPasswordToken: "tok" });
    remoteSessionService.isSessionHost.mockReturnValue(false);
    remoteSessionService.isAuthorizedForCredentials.mockReturnValue(true);
    remoteSessionService.buildSessionCredentials.mockReturnValue({});
    remoteSessionService.registerStation.mockResolvedValue("st-0002");
    User.findByPk.mockResolvedValue({ username: "   ", email: "bob@example.com" });
    mosquittoPasswdSync.ensureMqttBrokerUser.mockResolvedValue({ synced: true });

    await ctrl.verifySession({
      user: { id: 3 },
      body: { sessionId: "abcd1234abcd1234", joinChallenge: "validchallenge0000" },
    }, mockRes());

    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ displayName: "bob" })
    );
  });
});

// ─── kickSessionStation ──────────────────────────────────────────────────────
describe("kickSessionStation", () => {
  test("401 khi không có user", async () => {
    await ctrl.kickSessionStation({ user: null, body: {} }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 401, expect.any(String), "UNAUTHORIZED");
  });

  test("400 khi sessionId không hợp lệ", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue(null);
    await ctrl.kickSessionStation({ user: { id: 1 }, body: { sessionId: "bad", stationId: "st-1" } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "BAD_REQUEST");
  });

  test("400 khi stationId không phải string", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    await ctrl.kickSessionStation({ user: { id: 1 }, body: { sessionId: "abcd1234abcd1234", stationId: 123 } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "BAD_REQUEST");
  });

  test("403 khi kick thất bại", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.kickStationById.mockResolvedValue({ kicked: false });
    await ctrl.kickSessionStation({
      user: { id: 1 }, body: { sessionId: "abcd1234abcd1234", stationId: "st-001" },
    }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 403, expect.any(String), "KICK_FAILED");
  });

  test("200 khi kick thành công", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.kickStationById.mockResolvedValue({ kicked: true, joinChallenge: "newchallenge" });
    await ctrl.kickSessionStation({
      user: { id: 1 }, body: { sessionId: "abcd1234abcd1234", stationId: "st-001" },
    }, mockRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ stationId: "st-001", joinChallenge: "newchallenge" })
    );
  });
});

// ─── endSession ──────────────────────────────────────────────────────────────
describe("endSession", () => {
  test("401 khi không có user", async () => {
    await ctrl.endSession({ user: null, body: {} }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 401, expect.any(String), "UNAUTHORIZED");
  });

  test("400 khi sessionId không hợp lệ", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue(null);
    await ctrl.endSession({ user: { id: 1 }, body: { sessionId: "bad" } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "REMOTE_SESSION_INVALID");
  });

  test("404 khi result.reason === not_found", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.endRemoteSession.mockResolvedValue({ ended: false, reason: "not_found" });
    await ctrl.endSession({ user: { id: 1 }, body: { sessionId: "abcd1234abcd1234" } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 404, expect.any(String), "REMOTE_ROOM_NOT_FOUND");
  });

  test("403 khi không phải host", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.endRemoteSession.mockResolvedValue({ ended: false, reason: "not_host" });
    await ctrl.endSession({ user: { id: 1 }, body: { sessionId: "abcd1234abcd1234" } }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 403, expect.any(String), "REMOTE_SESSION_FORBIDDEN");
  });

  test("200 khi kết thúc thành công", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    remoteSessionService.endRemoteSession.mockResolvedValue({ ended: true, mqttBrokerUserRemoved: true });
    await ctrl.endSession({ user: { id: 1 }, body: { sessionId: "abcd1234abcd1234" } }, mockRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String),
      expect.objectContaining({ sessionId: "abcd1234abcd1234", mqttBrokerUserRemoved: true })
    );
  });
});

// ─── sendInviteEmail ─────────────────────────────────────────────────────────
describe("sendInviteEmail", () => {
  test("401 khi không có user", async () => {
    await ctrl.sendInviteEmail({ user: null, body: {} }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 401, expect.any(String), "UNAUTHORIZED");
  });

  test("400 khi sessionId không hợp lệ", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue(null);
    await ctrl.sendInviteEmail({ user: { id: 1 }, body: {} }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "REMOTE_SESSION_INVALID");
  });

  test("400 khi email không hợp lệ", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    await ctrl.sendInviteEmail({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234", email: "not-an-email", inviteUrl: "http://x.com" },
    }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "INVALID_EMAIL");
  });

  test("400 khi inviteUrl không hợp lệ theo isAllowedInviteUrl", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    isAllowedInviteUrl.mockReturnValue(false);
    await ctrl.sendInviteEmail({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234", email: "a@b.com", inviteUrl: "https://evil.com/x" },
    }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 400, expect.any(String), "INVALID_INVITE_URL");
  });

  test("404 khi không tìm thấy record", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    isAllowedInviteUrl.mockReturnValue(true);
    remoteSessionService.getSessionRecord.mockResolvedValue(null);
    await ctrl.sendInviteEmail({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234", email: "a@b.com", inviteUrl: "http://localhost:5173/invite" },
    }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 404, expect.any(String), "REMOTE_ROOM_NOT_FOUND");
  });

  test("403 khi không phải host", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    isAllowedInviteUrl.mockReturnValue(true);
    remoteSessionService.getSessionRecord.mockResolvedValue({});
    remoteSessionService.isSessionHost.mockReturnValue(false);
    await ctrl.sendInviteEmail({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234", email: "a@b.com", inviteUrl: "http://localhost:5173/invite" },
    }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 403, expect.any(String), "REMOTE_SESSION_FORBIDDEN");
  });

  test("200 khi gửi email thành công", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    isAllowedInviteUrl.mockReturnValue(true);
    remoteSessionService.getSessionRecord.mockResolvedValue({});
    remoteSessionService.isSessionHost.mockReturnValue(true);
    sendSessionInviteEmail.mockResolvedValue(undefined);
    await ctrl.sendInviteEmail({
      user: { id: 1, name: "Alice" },
      body: { sessionId: "abcd1234abcd1234", email: "bob@example.com", inviteUrl: "http://localhost:5173/invite" },
    }, mockRes());
    expect(sendSuccess).toHaveBeenCalledWith(
      expect.anything(), 200, expect.any(String), { email: "bob@example.com" }
    );
  });

  test("503 khi sendSessionInviteEmail throw", async () => {
    remoteSessionService.normalizeSessionId.mockReturnValue("abcd1234abcd1234");
    isAllowedInviteUrl.mockReturnValue(true);
    remoteSessionService.getSessionRecord.mockResolvedValue({});
    remoteSessionService.isSessionHost.mockReturnValue(true);
    sendSessionInviteEmail.mockRejectedValue(new Error("SMTP failed"));
    await ctrl.sendInviteEmail({
      user: { id: 1 },
      body: { sessionId: "abcd1234abcd1234", email: "bob@example.com", inviteUrl: "http://localhost:5173/invite" },
    }, mockRes());
    expect(sendError).toHaveBeenCalledWith(expect.anything(), 503, expect.any(String), "EMAIL_SEND_FAILED");
  });
});
