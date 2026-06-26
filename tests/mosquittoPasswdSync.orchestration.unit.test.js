process.env.NODE_ENV = "test";

const fs = require("fs");
const os = require("os");
const path = require("path");

jest.mock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
jest.mock("../kernels/remoteSession/mosquittoReload", () => ({
  isDockerCliEnabled: jest.fn(() => false),
  reloadMqttBrokerInDocker: jest.fn().mockResolvedValue(undefined),
  passwdVisibleInBrokerContainer: jest.fn(),
  upsertViaDockerExecPasswd: jest.fn(),
  upsertViaDockerPasswd: jest.fn(),
  upsertViaNativePasswd: jest.fn(),
  removeViaDockerPasswd: jest.fn(),
  removeViaNativePasswd: jest.fn(),
  scheduleHupOnce: jest.fn().mockResolvedValue(undefined),
  _resetHupStateForTests: jest.fn(),
  _getHupDebounceMs: jest.fn(() => 200),
}));

const reload = require("../kernels/remoteSession/mosquittoReload");
const SID = "0123456789abcdef"; // 16 hex hợp lệ

function freshSync(tmpDir) {
  jest.resetModules();
  process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "passwd");
  // Re-require mock module reference sau resetModules (cùng factory, instance mới).
  jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
  jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
    isDockerCliEnabled: jest.fn(() => false),
    reloadMqttBrokerInDocker: jest.fn().mockResolvedValue(undefined),
    passwdVisibleInBrokerContainer: jest.fn(),
    upsertViaDockerExecPasswd: jest.fn(),
    upsertViaDockerPasswd: jest.fn(),
    upsertViaNativePasswd: jest.fn(),
    removeViaDockerPasswd: jest.fn(),
    removeViaNativePasswd: jest.fn(),
    scheduleHupOnce: jest.fn().mockResolvedValue(undefined),
    _resetHupStateForTests: jest.fn(),
    _getHupDebounceMs: jest.fn(() => 200),
  }));
  const r = require("../kernels/remoteSession/mosquittoReload");
  const sync = require("../kernels/remoteSession/mosquittoPasswdSync");
  return { r, sync };
}

describe("mosquittoPasswdSync — orchestration", () => {
  let tmpDir;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "passwdsync-test-"));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("upsertMqttBrokerUser — guard clauses", () => {
    test("mkdirSync thật sự throw (dir cha read-only) → skip mkdir_failed", async () => {
      jest.resetModules();
      fs.chmodSync(tmpDir, 0o500); // không cho tạo subdir mới bên trong
      process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "sub", "passwd");
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        scheduleHupOnce: jest.fn(),
      }));
      const freshSyncMod = require("../kernels/remoteSession/mosquittoPasswdSync");

      const out = await freshSyncMod.upsertMqttBrokerUser(SID, "tok");
      fs.chmodSync(tmpDir, 0o700);

      expect(out.skipped).toBe(true);
      expect(out.reason).toBe("mkdir_failed");
    });

    test("sessionId không khớp pattern 16-hex → skip, không enqueue write", async () => {
      const { r, sync } = freshSync(tmpDir);
      const out = await sync.upsertMqttBrokerUser("not-a-valid-id", "tok");
      expect(out).toEqual({ skipped: true, reason: "invalid_session_id" });
      expect(r.scheduleHupOnce).not.toHaveBeenCalled();
    });

    test("thiếu mqttPasswordToken → skip missing_password", async () => {
      const { sync } = freshSync(tmpDir);
      const out = await sync.upsertMqttBrokerUser(SID, "");
      expect(out).toEqual({ skipped: true, reason: "missing_password" });
    });

    test("MQTT_PASSWD_FILE không cấu hình → skip, không tạo dir", async () => {
      jest.resetModules();
      delete process.env.MQTT_PASSWD_FILE;
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        scheduleHupOnce: jest.fn(),
      }));
      const sync = require("../kernels/remoteSession/mosquittoPasswdSync");
      const out = await sync.upsertMqttBrokerUser(SID, "tok");
      expect(out).toEqual({ skipped: true, reason: "MQTT_PASSWD_FILE không cấu hình" });
    });
  });

  describe("upsertMqttBrokerUser — Docker CLI enabled", () => {
    test("exec thành công + visible ngay → synced, viaDockerExec, KHÔNG thử docker run", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.isDockerCliEnabled.mockReturnValue(true);
      r.upsertViaDockerExecPasswd.mockResolvedValue(undefined);
      r.passwdVisibleInBrokerContainer.mockResolvedValue(true);

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toMatchObject({ synced: true, needsReload: true, viaDockerExec: true });
      expect(out.retried).toBeUndefined();
      expect(r.upsertViaDockerPasswd).not.toHaveBeenCalled();
      expect(r.scheduleHupOnce).toHaveBeenCalledTimes(1);
    });

    test("exec thành công nhưng không visible lần đầu, visible ở lần ghi lại → retried:true", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.isDockerCliEnabled.mockReturnValue(true);
      r.upsertViaDockerExecPasswd.mockResolvedValue(undefined);
      r.passwdVisibleInBrokerContainer.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toMatchObject({ synced: true, viaDockerExec: true, retried: true });
      expect(r.upsertViaDockerExecPasswd).toHaveBeenCalledTimes(2);
    });

    test("exec throw → fallback docker run; visible sau đó → trả kết quả docker run, không retry exec", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.isDockerCliEnabled.mockReturnValue(true);
      r.upsertViaDockerExecPasswd.mockRejectedValue(new Error("exec down"));
      r.upsertViaDockerPasswd.mockResolvedValue(undefined);
      r.passwdVisibleInBrokerContainer.mockResolvedValue(true);

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toMatchObject({ synced: true, viaDocker: true, needsReload: true });
      // upsertViaDockerExecPasswd: 1 lần thử ban đầu (throw) — không có lần retry vì đã visible.
      expect(r.upsertViaDockerExecPasswd).toHaveBeenCalledTimes(1);
    });

    test("exec throw → docker run xong nhưng vẫn KHÔNG visible → thử exec lại (swallow lỗi), vẫn trả docker run result", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.isDockerCliEnabled.mockReturnValue(true);
      r.upsertViaDockerExecPasswd.mockRejectedValueOnce(new Error("exec down")).mockRejectedValueOnce(new Error("still down"));
      r.upsertViaDockerPasswd.mockResolvedValue(undefined);
      r.passwdVisibleInBrokerContainer.mockResolvedValue(false);

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toMatchObject({ synced: true, viaDocker: true });
      expect(r.upsertViaDockerExecPasswd).toHaveBeenCalledTimes(2);
    });

    test("exec throw + docker run throw → rơi xuống native PBKDF2 fallback (vẫn ghi thành công)", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.isDockerCliEnabled.mockReturnValue(true);
      r.upsertViaDockerExecPasswd
        .mockRejectedValueOnce(new Error("exec down"))
        .mockResolvedValueOnce(undefined); // lần gọi 2: sync sau native fallback, cho thành công
      r.upsertViaDockerPasswd.mockRejectedValue(new Error("docker run down"));

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toMatchObject({ synced: true, viaNativeFallback: true });
      expect(fs.existsSync(path.join(tmpDir, "passwd"))).toBe(true);
    });

    test("exec + docker run + sync-lại-sau-fallback đều throw → vẫn synced qua native, lỗi sync bị swallow", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.isDockerCliEnabled.mockReturnValue(true);
      r.upsertViaDockerExecPasswd.mockRejectedValue(new Error("exec down luôn"));
      r.upsertViaDockerPasswd.mockRejectedValue(new Error("docker run down"));

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toMatchObject({ synced: true, viaNativeFallback: true });
      expect(r.upsertViaDockerExecPasswd).toHaveBeenCalledTimes(2);
    });
  });

  describe("upsertMqttBrokerUser — Docker CLI disabled", () => {
    test("native CLI (mosquitto_passwd host) thành công → synced không có cờ docker", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.upsertViaNativePasswd.mockResolvedValue(undefined);

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toEqual({ synced: true, needsReload: true });
    });

    test("native CLI thất bại → fallback PBKDF2, ghi file thật thành công", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.upsertViaNativePasswd.mockRejectedValue(new Error("CLI not installed"));

      const out = await sync.upsertMqttBrokerUser(SID, "tok");

      expect(out).toMatchObject({ synced: true, needsReload: true, viaNativeFallback: true });
      const content = fs.readFileSync(path.join(tmpDir, "passwd"), "utf8");
      expect(content).toMatch(new RegExp(`^${SID}:`));
    });

    test("native CLI thất bại + dir cha thực ra là file → mọi cách ghi đều thất bại", async () => {
      const { sync } = freshSync(tmpDir);
      // Trỏ MQTT_PASSWD_FILE vào file con của một path không phải directory để mọi write đều lỗi
      // (existsSync(dir) trả true vì "blocker" tồn tại như file, nên mkdir bị bỏ qua; write thật mới lộ lỗi).
      const blockerFile = path.join(tmpDir, "blocker");
      fs.writeFileSync(blockerFile, "x");
      process.env.MQTT_PASSWD_FILE = path.join(blockerFile, "passwd");
      jest.resetModules();
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        upsertViaNativePasswd: jest.fn().mockRejectedValue(new Error("no cli")),
        scheduleHupOnce: jest.fn(),
      }));
      const freshSyncMod = require("../kernels/remoteSession/mosquittoPasswdSync");

      const out = await freshSyncMod.upsertMqttBrokerUser(SID, "tok");

      expect(out.skipped).toBe(true);
      expect(out.reason).toBe("all_methods_failed");
    });
  });

  describe("upsertMqttBrokerUser — HUP", () => {
    test("needsReload=false (lý thuyết) → không gọi scheduleHupOnce", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.upsertViaNativePasswd.mockRejectedValue(new Error("fail"));
      // Native fallback luôn set needsReload true khi ghi thành công, nên test nhánh
      // "không HUP" bằng cách làm mọi cách ghi đều thất bại (all_methods_failed).
      const blockerFile = path.join(tmpDir, "blocker2");
      fs.writeFileSync(blockerFile, "x");
      process.env.MQTT_PASSWD_FILE = path.join(blockerFile, "passwd");
      jest.resetModules();
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        upsertViaNativePasswd: jest.fn().mockRejectedValue(new Error("fail")),
        scheduleHupOnce: jest.fn(),
      }));
      const freshR = require("../kernels/remoteSession/mosquittoReload");
      const freshSyncMod = require("../kernels/remoteSession/mosquittoPasswdSync");

      const out = await freshSyncMod.upsertMqttBrokerUser(SID, "tok");

      expect(out.skipped).toBe(true);
      expect(freshR.scheduleHupOnce).not.toHaveBeenCalled();
    });
  });

  describe("ensureMqttBrokerUser", () => {
    test("alreadyPresent=true khi sessionId đã có entry trong file, vẫn upsert lại", async () => {
      const { r, sync } = freshSync(tmpDir);
      const file = path.join(tmpDir, "passwd");
      fs.writeFileSync(file, `${SID}:somehash\n`);
      r.upsertViaNativePasswd.mockResolvedValue(undefined);

      const out = await sync.ensureMqttBrokerUser(SID, "tok");

      expect(out.alreadyPresent).toBe(true);
      expect(out.passwdReloaded).toBe(true);
    });

    test("alreadyPresent=false khi chưa có file", async () => {
      const { r, sync } = freshSync(tmpDir);
      r.upsertViaNativePasswd.mockResolvedValue(undefined);

      const out = await sync.ensureMqttBrokerUser(SID, "tok");

      expect(out.alreadyPresent).toBe(false);
    });
  });

  describe("removeMqttBrokerUser", () => {
    test("sessionId không hợp lệ → skip", async () => {
      const { sync } = freshSync(tmpDir);
      const out = await sync.removeMqttBrokerUser("bad-id");
      expect(out).toEqual({ skipped: true, reason: "invalid_session_id" });
    });

    test("user không có trong file → removed:true ngay, vẫn HUP", async () => {
      const { r, sync } = freshSync(tmpDir);
      fs.writeFileSync(path.join(tmpDir, "passwd"), "other:hash\n");

      const out = await sync.removeMqttBrokerUser(SID);

      expect(out).toEqual({ removed: true });
      expect(r.scheduleHupOnce).toHaveBeenCalledTimes(1);
    });

    test("xóa native thành công → removed:true", async () => {
      const { sync } = freshSync(tmpDir);
      const file = path.join(tmpDir, "passwd");
      fs.writeFileSync(file, `${SID}:hash\nother:hash2\n`);

      const out = await sync.removeMqttBrokerUser(SID);

      expect(out).toEqual({ removed: true });
      const remaining = fs.readFileSync(file, "utf8");
      expect(remaining).not.toContain(SID);
      expect(remaining).toContain("other:hash2");
    });

    test("removePasswdEntryNative throw (dir read-only) → fallback removeViaNativePasswd thành công", async () => {
      jest.resetModules();
      process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "passwd");
      fs.writeFileSync(path.join(tmpDir, "passwd"), `${SID}:hash\n`);
      fs.chmodSync(tmpDir, 0o500); // rename tmp→passwd sẽ throw vì dir read-only
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        removeViaNativePasswd: jest.fn().mockResolvedValue(undefined),
        removeViaDockerPasswd: jest.fn().mockRejectedValue(new Error("should not reach")),
        scheduleHupOnce: jest.fn().mockResolvedValue(undefined),
      }));
      const freshR = require("../kernels/remoteSession/mosquittoReload");
      const freshSyncMod = require("../kernels/remoteSession/mosquittoPasswdSync");

      const out = await freshSyncMod.removeMqttBrokerUser(SID);
      fs.chmodSync(tmpDir, 0o700);

      expect(out).toEqual({ removed: true });
      expect(freshR.removeViaNativePasswd).toHaveBeenCalledTimes(1);
      expect(freshR.removeViaDockerPasswd).not.toHaveBeenCalled();
    });

    test("native + CLI đều fail → fallback removeViaDockerPasswd thành công", async () => {
      jest.resetModules();
      process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "passwd");
      fs.writeFileSync(path.join(tmpDir, "passwd"), `${SID}:hash\n`);
      fs.chmodSync(tmpDir, 0o500);
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        removeViaNativePasswd: jest.fn().mockRejectedValue(new Error("cli fail")),
        removeViaDockerPasswd: jest.fn().mockResolvedValue(undefined),
        scheduleHupOnce: jest.fn().mockResolvedValue(undefined),
      }));
      const freshR = require("../kernels/remoteSession/mosquittoReload");
      const freshSyncMod = require("../kernels/remoteSession/mosquittoPasswdSync");

      const out = await freshSyncMod.removeMqttBrokerUser(SID);
      fs.chmodSync(tmpDir, 0o700);

      expect(out).toEqual({ removed: true });
      expect(freshR.removeViaDockerPasswd).toHaveBeenCalledTimes(1);
    });

    test("mọi cách xóa đều thất bại → removed:false, KHÔNG HUP", async () => {
      jest.resetModules();
      process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "passwd");
      fs.writeFileSync(path.join(tmpDir, "passwd"), `${SID}:hash\n`);
      // Khóa file thành read-only để removePasswdEntryNative (native rename) thất bại trên thư mục read-only.
      fs.chmodSync(tmpDir, 0o500);
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        removeViaNativePasswd: jest.fn().mockRejectedValue(new Error("cli fail")),
        removeViaDockerPasswd: jest.fn().mockRejectedValue(new Error("docker fail")),
        scheduleHupOnce: jest.fn(),
      }));
      const freshR = require("../kernels/remoteSession/mosquittoReload");
      const freshSyncMod = require("../kernels/remoteSession/mosquittoPasswdSync");

      const out = await freshSyncMod.removeMqttBrokerUser(SID);

      fs.chmodSync(tmpDir, 0o700);
      expect(out).toEqual({ removed: false });
      expect(freshR.scheduleHupOnce).not.toHaveBeenCalled();
    });
  });

  describe("cleanupExpiredUsers", () => {
    test("không có passwd file → skip", async () => {
      const { sync } = freshSync(tmpDir);
      const out = await sync.cleanupExpiredUsers(async () => []);
      expect(out).toEqual({ skipped: true, reason: "MQTT_PASSWD_FILE không tồn tại hoặc không được cấu hình" });
    });

    test("file không có session id hợp lệ nào → skip", async () => {
      const { sync } = freshSync(tmpDir);
      fs.writeFileSync(path.join(tmpDir, "passwd"), "not-a-session-id:hash\n");
      const out = await sync.cleanupExpiredUsers(async () => []);
      expect(out).toEqual({ skipped: true, reason: "Không có session ID nào trong file" });
    });

    test("xóa đúng các session không còn active, giữ lại session active", async () => {
      const { r, sync } = freshSync(tmpDir);
      const SID2 = "fedcba9876543210";
      const file = path.join(tmpDir, "passwd");
      fs.writeFileSync(file, `${SID}:hash1\n${SID2}:hash2\n`);

      const out = await sync.cleanupExpiredUsers(async () => [SID2]);

      expect(out).toEqual({ success: true, removedCount: 1 });
      const remaining = fs.readFileSync(file, "utf8");
      expect(remaining).not.toContain(SID);
      expect(remaining).toContain(SID2);
      expect(r.reloadMqttBrokerInDocker).toHaveBeenCalledTimes(1);
    });

    test("mọi session đều active → không xóa gì, không reload", async () => {
      const { r, sync } = freshSync(tmpDir);
      fs.writeFileSync(path.join(tmpDir, "passwd"), `${SID}:hash1\n`);

      const out = await sync.cleanupExpiredUsers(async () => [SID]);

      expect(out).toEqual({ success: true, removedCount: 0 });
      expect(r.reloadMqttBrokerInDocker).not.toHaveBeenCalled();
    });

    test("getActiveSessionIdsFn throw → trả skipped/error, không crash", async () => {
      const { sync } = freshSync(tmpDir);
      fs.writeFileSync(path.join(tmpDir, "passwd"), `${SID}:hash1\n`);

      const out = await sync.cleanupExpiredUsers(async () => {
        throw new Error("redis down");
      });

      expect(out).toEqual({ skipped: true, reason: "error", error: "redis down" });
    });

    test("removePasswdEntryNative throw khi cleanup → fallback removeViaNativePasswd rồi removeViaDockerPasswd", async () => {
      jest.resetModules();
      process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "passwd");
      fs.writeFileSync(path.join(tmpDir, "passwd"), `${SID}:hash1\n`);
      fs.chmodSync(tmpDir, 0o500); // buộc removePasswdEntryNative (rename) throw
      jest.doMock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));
      jest.doMock("../kernels/remoteSession/mosquittoReload", () => ({
        isDockerCliEnabled: jest.fn(() => false),
        reloadMqttBrokerInDocker: jest.fn().mockResolvedValue(undefined),
        removeViaNativePasswd: jest.fn().mockRejectedValue(new Error("cli fail")),
        removeViaDockerPasswd: jest.fn().mockResolvedValue(undefined),
        scheduleHupOnce: jest.fn(),
      }));
      const freshR = require("../kernels/remoteSession/mosquittoReload");
      const freshSyncMod = require("../kernels/remoteSession/mosquittoPasswdSync");

      const out = await freshSyncMod.cleanupExpiredUsers(async () => []);
      fs.chmodSync(tmpDir, 0o700);

      expect(out).toEqual({ success: true, removedCount: 1 });
      expect(freshR.removeViaNativePasswd).toHaveBeenCalledWith(path.join(tmpDir, "passwd"), SID);
      expect(freshR.removeViaDockerPasswd).toHaveBeenCalledTimes(1);
      expect(freshR.reloadMqttBrokerInDocker).toHaveBeenCalledTimes(1);
    });
  });
});
