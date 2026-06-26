process.env.NODE_ENV = "test";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ORIGINAL_ENV = { ...process.env };

describe("passwdFileIO", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "passwd-io-test-"));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.resetModules();
  });

  describe("passwdFilePath", () => {
    test("trả null khi MQTT_PASSWD_FILE rỗng/không đặt", () => {
      delete process.env.MQTT_PASSWD_FILE;
      const { passwdFilePath } = require("../kernels/remoteSession/passwdFileIO");
      expect(passwdFilePath()).toBeNull();
    });

    test("trả null khi MQTT_PASSWD_FILE chỉ chứa khoảng trắng", () => {
      process.env.MQTT_PASSWD_FILE = "   ";
      const { passwdFilePath } = require("../kernels/remoteSession/passwdFileIO");
      expect(passwdFilePath()).toBeNull();
    });

    test("giữ nguyên đường dẫn tuyệt đối", () => {
      process.env.MQTT_PASSWD_FILE = "/etc/mosquitto/passwd";
      const { passwdFilePath } = require("../kernels/remoteSession/passwdFileIO");
      expect(passwdFilePath()).toBe("/etc/mosquitto/passwd");
    });

    test("resolve đường dẫn tương đối theo WEBAPI_ROOT, không theo cwd", () => {
      process.env.MQTT_PASSWD_FILE = "../docker/mosquitto/passwd";
      const { passwdFilePath, WEBAPI_ROOT } = require("../kernels/remoteSession/passwdFileIO");
      expect(passwdFilePath()).toBe(path.resolve(WEBAPI_ROOT, "../docker/mosquitto/passwd"));
    });
  });

  describe("writePasswdEntryNative + removePasswdEntryNative", () => {
    test("createNew=true tạo file mới với 1 entry, không còn file .tmp", () => {
      const { writePasswdEntryNative } = require("../kernels/remoteSession/passwdFileIO");
      const file = path.join(tmpDir, "passwd");

      writePasswdEntryNative(file, "session1", "secret", true);

      const content = fs.readFileSync(file, "utf8");
      expect(content).toMatch(/^session1:/);
      expect(fs.readdirSync(tmpDir)).toEqual(["passwd"]);
    });

    test("createNew=false thêm entry mới vào file đã có, giữ entry cũ", () => {
      const { writePasswdEntryNative } = require("../kernels/remoteSession/passwdFileIO");
      const file = path.join(tmpDir, "passwd");

      writePasswdEntryNative(file, "session1", "secret1", true);
      writePasswdEntryNative(file, "session2", "secret2", false);

      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      expect(lines).toHaveLength(2);
      expect(lines.some((l) => l.startsWith("session1:"))).toBe(true);
      expect(lines.some((l) => l.startsWith("session2:"))).toBe(true);
    });

    test("ghi lại cùng sessionId → update tại chỗ, không tạo dòng trùng", () => {
      const { writePasswdEntryNative } = require("../kernels/remoteSession/passwdFileIO");
      const file = path.join(tmpDir, "passwd");

      writePasswdEntryNative(file, "session1", "secret-old", true);
      const oldHash = fs.readFileSync(file, "utf8").trim();
      writePasswdEntryNative(file, "session1", "secret-new", false);

      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(lines[0]).not.toBe(oldHash);
      expect(lines[0]).toMatch(/^session1:/);
    });

    test("createNew=false trên file chưa tồn tại → tạo mới bình thường (không throw)", () => {
      const { writePasswdEntryNative } = require("../kernels/remoteSession/passwdFileIO");
      const file = path.join(tmpDir, "passwd-not-exist-yet");

      expect(() => writePasswdEntryNative(file, "session1", "secret", false)).not.toThrow();
      expect(fs.existsSync(file)).toBe(true);
    });

    test("removePasswdEntryNative xóa đúng entry, giữ entry khác", () => {
      const { writePasswdEntryNative, removePasswdEntryNative } = require("../kernels/remoteSession/passwdFileIO");
      const file = path.join(tmpDir, "passwd");

      writePasswdEntryNative(file, "session1", "secret1", true);
      writePasswdEntryNative(file, "session2", "secret2", false);
      removePasswdEntryNative(file, "session1");

      const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/^session2:/);
    });

    test("removePasswdEntryNative no-op khi file không tồn tại", () => {
      const { removePasswdEntryNative } = require("../kernels/remoteSession/passwdFileIO");
      const file = path.join(tmpDir, "passwd-missing");
      expect(() => removePasswdEntryNative(file, "session1")).not.toThrow();
      expect(fs.existsSync(file)).toBe(false);
    });
  });

  describe("passwdFileHasUser", () => {
    test("false khi MQTT_PASSWD_FILE không đặt", () => {
      delete process.env.MQTT_PASSWD_FILE;
      const { passwdFileHasUser } = require("../kernels/remoteSession/passwdFileIO");
      expect(passwdFileHasUser("session1")).toBe(false);
    });

    test("false khi file chưa tồn tại", () => {
      process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "no-such-file");
      const { passwdFileHasUser } = require("../kernels/remoteSession/passwdFileIO");
      expect(passwdFileHasUser("session1")).toBe(false);
    });

    test("true khi sessionId có entry trong file", () => {
      const file = path.join(tmpDir, "passwd");
      process.env.MQTT_PASSWD_FILE = file;
      const { writePasswdEntryNative, passwdFileHasUser } = require("../kernels/remoteSession/passwdFileIO");
      writePasswdEntryNative(file, "session1", "secret", true);
      expect(passwdFileHasUser("session1")).toBe(true);
      expect(passwdFileHasUser("session-other")).toBe(false);
    });
  });

  describe("enqueueWrite", () => {
    test("chạy tuần tự theo đúng thứ tự enqueue", async () => {
      const { enqueueWrite } = require("../kernels/remoteSession/passwdFileIO");
      const order = [];
      await Promise.all([
        enqueueWrite(() => order.push(1)),
        enqueueWrite(() => order.push(2)),
        enqueueWrite(() => order.push(3)),
      ]);
      expect(order).toEqual([1, 2, 3]);
    });

    test("một fn() reject không làm hỏng queue — fn tiếp theo vẫn chạy", async () => {
      const { enqueueWrite } = require("../kernels/remoteSession/passwdFileIO");
      const order = [];
      const p1 = enqueueWrite(() => {
        order.push("a");
        throw new Error("boom");
      });
      const p2 = enqueueWrite(() => order.push("b"));

      await expect(p1).rejects.toThrow("boom");
      await p2;
      expect(order).toEqual(["a", "b"]);
    });
  });
});
