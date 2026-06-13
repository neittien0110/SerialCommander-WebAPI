process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-remote-session";
process.env.SESSION_SECRET = "test-session-secret-remote-session";
process.env.FRONTEND_URL = "http://localhost:5173";

require("rootpath")();

jest.mock("configs/passport", () => ({
  initialize: () => (_req, _res, next) => next(),
  session: () => (_req, _res, next) => next(),
  authenticate: () => (_req, _res, next) => next(),
}));

const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("index");
const remoteSessionService = require("modules/remote/services/remoteSessionService");

function authHeader(userId = 42) {
  const token = jwt.sign({ id: userId, role: "user" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  return { Authorization: `Bearer ${token}` };
}

describe("Remote session API integration (real service layer)", () => {
  const prevMqttPasswdFile = process.env.MQTT_PASSWD_FILE;
  beforeAll(() => {
    delete process.env.MQTT_PASSWD_FILE;
  });
  afterAll(() => {
    if (prevMqttPasswdFile !== undefined) process.env.MQTT_PASSWD_FILE = prevMqttPasswdFile;
    else delete process.env.MQTT_PASSWD_FILE;
  });

  test("POST /api/remote/session → host nhận credentials", async () => {
    const res = await request(app)
      .post("/api/remote/session")
      .set(authHeader(99))
      .expect(201);

    expect(res.body.sessionId).toMatch(/^[a-f0-9]{16}$/);
    expect(res.body.mqttPasswordToken).toBeTruthy();
    expect(res.body.envelopeToken).toBeTruthy();
    expect(res.body.joinChallenge).toMatch(/^[a-f0-9]{32}$/);
  });

  test("POST /api/remote/session/verify — station join với joinChallenge", async () => {
    const created = await remoteSessionService.createRemoteSession(10);
    const res = await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(55))
      .send({ sessionId: created.sessionId, joinChallenge: created.joinChallenge })
      .expect(200);

    expect(res.body.sessionId).toBe(created.sessionId);
    expect(res.body.mqttPasswordToken).toBe(created.mqttPasswordToken);
    expect(res.body.stationId).toMatch(/^[a-f0-9]{8}$/);
  });

  test("POST /api/remote/session/verify — host refresh không cần joinChallenge", async () => {
    const created = await remoteSessionService.createRemoteSession(77);
    const res = await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(77))
      .send({ sessionId: created.sessionId })
      .expect(200);

    expect(res.body.mqttPasswordToken).toBe(created.mqttPasswordToken);
    expect(res.body.envelopeToken).toBe(created.envelopeToken);
  });

  test("POST /api/remote/session/verify — token sai → 401", async () => {
    const created = await remoteSessionService.createRemoteSession(3);
    await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(3))
      .send({ sessionId: created.sessionId, mqttPasswordToken: "wrong-token-value" })
      .expect(401);
  });

  test("POST kick-station → rotate mã; mã cũ 403, mã mới join được", async () => {
    const created = await remoteSessionService.createRemoteSession(30);
    const oldChallenge = created.joinChallenge;

    const joinRes = await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(60))
      .send({ sessionId: created.sessionId, joinChallenge: oldChallenge })
      .expect(200);

    const stationId = joinRes.body.stationId;
    expect(stationId).toMatch(/^[a-f0-9]{8}$/);

    const kickRes = await request(app)
      .post("/api/remote/session/kick-station")
      .set(authHeader(30))
      .send({ sessionId: created.sessionId, stationId })
      .expect(200);

    const newChallenge = kickRes.body.joinChallenge;
    expect(newChallenge).toMatch(/^[a-f0-9]{32}$/);
    expect(newChallenge).not.toBe(oldChallenge);

    await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(60))
      .send({ sessionId: created.sessionId, joinChallenge: oldChallenge })
      .expect(403);

    const rejoin = await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(60))
      .send({ sessionId: created.sessionId, joinChallenge: newChallenge })
      .expect(200);

    expect(rejoin.body.stationId).toMatch(/^[a-f0-9]{8}$/);
    expect(rejoin.body.stationId).not.toBe(stationId);
  });

  test("POST kick-station — station khác vẫn join bằng mã mới sau kick 1 người", async () => {
    const created = await remoteSessionService.createRemoteSession(31);
    const oldChallenge = created.joinChallenge;

    const stationB = await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(61))
      .send({ sessionId: created.sessionId, joinChallenge: oldChallenge })
      .expect(200);

    const stationA = await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(62))
      .send({ sessionId: created.sessionId, joinChallenge: oldChallenge })
      .expect(200);

    const kickRes = await request(app)
      .post("/api/remote/session/kick-station")
      .set(authHeader(31))
      .send({ sessionId: created.sessionId, stationId: stationA.body.stationId })
      .expect(200);

    const newChallenge = kickRes.body.joinChallenge;

    await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(62))
      .send({ sessionId: created.sessionId, joinChallenge: oldChallenge })
      .expect(403);

    expect(stationB.body.stationId).toMatch(/^[a-f0-9]{8}$/);

    await request(app)
      .post("/api/remote/session/verify")
      .set(authHeader(62))
      .send({ sessionId: created.sessionId, joinChallenge: newChallenge })
      .expect(200);
  });
});
