process.env.NODE_ENV = "test";

// execFile thật có `util.promisify.custom` để promisify() resolve {stdout, stderr}
// đúng kiểu. Mock trần (jest.fn()) không có symbol này nên promisify() fallback
// generic — chỉ resolve giá trị đầu tiên, làm sai mọi chỗ destructure { stdout }.
jest.mock("child_process", () => {
  const { promisify } = require("util");
  const execFile = jest.fn();
  execFile[promisify.custom] = (file, args, options) =>
    new Promise((resolve, reject) => {
      execFile(file, args, options, (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve({ stdout, stderr });
      });
    });
  return { execFile };
});
jest.mock("../kernels/logging/appLogger", () => ({ logInfo: jest.fn(), logWarn: jest.fn() }));

const fs = require("fs");
const os = require("os");
const path = require("path");

const ORIGINAL_ENV = { ...process.env };

/** cb-style mock: (cmd, args, opts, cb) => cb(err, stdout, stderr) */
function okExec(stdout = "", stderr = "") {
  return (cmd, args, opts, cb) => cb(null, stdout, stderr);
}
function failExec(message = "exec failed") {
  return (cmd, args, opts, cb) => cb(new Error(message));
}

function load() {
  jest.resetModules();
  const { execFile } = require("child_process");
  const mod = require("../kernels/remoteSession/mosquittoReload");
  return { execFile, mod };
}

describe("mosquittoReload", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("isDockerCliEnabled / containerPasswdPath", () => {
    test("isDockerCliEnabled true chỉ khi MQTT_DOCKER_CLI_ENABLED==='true'", () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      expect(load().mod.isDockerCliEnabled()).toBe(true);
      process.env.MQTT_DOCKER_CLI_ENABLED = "1";
      expect(load().mod.isDockerCliEnabled()).toBe(false);
      delete process.env.MQTT_DOCKER_CLI_ENABLED;
      expect(load().mod.isDockerCliEnabled()).toBe(false);
    });

    test("containerPasswdPath dùng default khi không cấu hình, trim khi có", () => {
      delete process.env.MQTT_PASSWD_CONTAINER_PATH;
      expect(load().mod.containerPasswdPath()).toBe("/mosquitto/config/passwd");
      process.env.MQTT_PASSWD_CONTAINER_PATH = "  /custom/passwd  ";
      expect(load().mod.containerPasswdPath()).toBe("/custom/passwd");
    });
  });

  describe("dockerBrokerContainerCandidates", () => {
    test("ưu tiên MQTT_BROKER_HUP_CONTAINER nếu có", () => {
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt-custom";
      expect(load().mod.dockerBrokerContainerCandidates()).toEqual(["sc-mqtt-custom"]);
    });

    test("fallback sang MQTT_BROKER_RELOAD_CONTAINER nếu thiếu HUP_CONTAINER", () => {
      delete process.env.MQTT_BROKER_HUP_CONTAINER;
      process.env.MQTT_BROKER_RELOAD_CONTAINER = "sc-mqtt-reload";
      expect(load().mod.dockerBrokerContainerCandidates()).toEqual(["sc-mqtt-reload"]);
    });

    test("production/test không có override → rỗng (an toàn, không đoán container)", () => {
      delete process.env.MQTT_BROKER_HUP_CONTAINER;
      delete process.env.MQTT_BROKER_RELOAD_CONTAINER;
      process.env.NODE_ENV = "production";
      expect(load().mod.dockerBrokerContainerCandidates()).toEqual([]);
    });

    test("dev (NODE_ENV=development) không override → fallback containers mặc định", () => {
      delete process.env.MQTT_BROKER_HUP_CONTAINER;
      delete process.env.MQTT_BROKER_RELOAD_CONTAINER;
      process.env.NODE_ENV = "development";
      expect(load().mod.dockerBrokerContainerCandidates()).toEqual(["sc-mqtt-demo", "sc-mqtt"]);
    });
  });

  describe("reloadMqttBrokerInDocker", () => {
    test("docker CLI disabled → return ngay, không execFile", async () => {
      delete process.env.MQTT_DOCKER_CLI_ENABLED;
      const { execFile, mod } = load();
      await mod.reloadMqttBrokerInDocker();
      expect(execFile).not.toHaveBeenCalled();
    });

    test("CLI enabled nhưng không có container candidate → return ngay", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.NODE_ENV = "production";
      delete process.env.MQTT_BROKER_HUP_CONTAINER;
      delete process.env.MQTT_BROKER_RELOAD_CONTAINER;
      const { execFile, mod } = load();
      await mod.reloadMqttBrokerInDocker();
      expect(execFile).not.toHaveBeenCalled();
    });

    test("HUP container đầu tiên thành công → không thử restart", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.reloadMqttBrokerInDocker();

      const killCalls = execFile.mock.calls.filter(([cmd, args]) => cmd === "docker" && args[0] === "kill");
      const restartCalls = execFile.mock.calls.filter(([cmd, args]) => cmd === "docker" && args[0] === "restart");
      expect(killCalls).toHaveLength(1);
      expect(restartCalls).toHaveLength(0);
    });

    test("HUP fail mọi container → fallback restart, thành công ở container nào đó", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (args[0] === "kill") return cb(new Error("kill failed"));
        return cb(null, "", "");
      });

      await mod.reloadMqttBrokerInDocker();

      const restartCalls = execFile.mock.calls.filter(([cmd, args]) => cmd === "docker" && args[0] === "restart");
      expect(restartCalls).toHaveLength(1);
    });

    test("HUP và restart đều fail ở mọi container → không throw, chỉ log", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(failExec());

      await expect(mod.reloadMqttBrokerInDocker()).resolves.toBeUndefined();
    });
  });

  describe("reloadMqttBroker", () => {
    test("ưu tiên host reload — gọi đúng bash -lc <cmd>, không gọi docker khi host thành công", async () => {
      process.env.MQTT_BROKER_RELOAD_CMD = "systemctl reload mosquitto";
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.reloadMqttBroker();

      expect(execFile).toHaveBeenCalledWith(
        "bash",
        ["-lc", "systemctl reload mosquitto"],
        expect.objectContaining({ timeout: 15000 }),
        expect.any(Function)
      );
      const dockerCalls = execFile.mock.calls.filter(([cmd]) => cmd === "docker");
      expect(dockerCalls).toHaveLength(0);
    });

    test("host reload có cấu hình nhưng execFile fail → fallback sang docker", async () => {
      process.env.MQTT_BROKER_RELOAD_CMD = "false";
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (cmd === "bash") return cb(new Error("reload script failed"));
        return cb(null, "", "");
      });

      await mod.reloadMqttBroker();

      const dockerCalls = execFile.mock.calls.filter(([cmd]) => cmd === "docker");
      expect(dockerCalls.length).toBeGreaterThan(0);
    });

    test("host reload không cấu hình → fallback sang docker", async () => {
      delete process.env.MQTT_BROKER_RELOAD_CMD;
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.reloadMqttBroker();

      const dockerCalls = execFile.mock.calls.filter(([cmd]) => cmd === "docker");
      expect(dockerCalls.length).toBeGreaterThan(0);
    });
  });

  describe("passwdVisibleInBrokerContainer", () => {
    test("CLI disabled → true ngay, không execFile", async () => {
      delete process.env.MQTT_DOCKER_CLI_ENABLED;
      const { execFile, mod } = load();
      await expect(mod.passwdVisibleInBrokerContainer("s1")).resolves.toBe(true);
      expect(execFile).not.toHaveBeenCalled();
    });

    test("CLI enabled, grep thành công ở container đầu → true", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await expect(mod.passwdVisibleInBrokerContainer("s1")).resolves.toBe(true);
    });

    test("CLI enabled, grep fail ở mọi container → false", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(failExec());

      await expect(mod.passwdVisibleInBrokerContainer("s1")).resolves.toBe(false);
    });
  });

  describe("mirrorContainerPasswdToHost", () => {
    let tmpDir;
    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-test-"));
    });
    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("không có MQTT_PASSWD_FILE → no-op, không execFile", async () => {
      delete process.env.MQTT_PASSWD_FILE;
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      const { execFile, mod } = load();
      await mod.mirrorContainerPasswdToHost();
      expect(execFile).not.toHaveBeenCalled();
    });

    test("CLI disabled → no-op", async () => {
      process.env.MQTT_PASSWD_FILE = path.join(tmpDir, "passwd");
      delete process.env.MQTT_DOCKER_CLI_ENABLED;
      const { execFile, mod } = load();
      await mod.mirrorContainerPasswdToHost();
      expect(execFile).not.toHaveBeenCalled();
    });

    test("docker cat thành công → ghi nội dung container vào file host (atomic, không còn .mirror tmp)", async () => {
      const file = path.join(tmpDir, "passwd");
      process.env.MQTT_PASSWD_FILE = file;
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec("s1:hash-from-container\n"));

      await mod.mirrorContainerPasswdToHost();

      expect(fs.readFileSync(file, "utf8")).toBe("s1:hash-from-container\n");
      expect(fs.readdirSync(tmpDir)).toEqual(["passwd"]);
    });
  });

  describe("upsertViaDockerExecPasswd", () => {
    test("CLI disabled → throw", async () => {
      delete process.env.MQTT_DOCKER_CLI_ENABLED;
      const { mod } = load();
      await expect(mod.upsertViaDockerExecPasswd("s1", "tok")).rejects.toThrow(
        "MQTT_DOCKER_CLI_ENABLED is not true"
      );
    });

    test("không có container candidate → throw", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.NODE_ENV = "production";
      delete process.env.MQTT_BROKER_HUP_CONTAINER;
      delete process.env.MQTT_BROKER_RELOAD_CONTAINER;
      const { mod } = load();
      await expect(mod.upsertViaDockerExecPasswd("s1", "tok")).rejects.toThrow(
        "no docker broker container configured"
      );
    });

    test("exec mosquitto_passwd thành công + visible trong container → resolve, có mirror", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      delete process.env.MQTT_PASSWD_FILE;
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await expect(mod.upsertViaDockerExecPasswd("s1", "tok")).resolves.toBeUndefined();
      const execCalls = execFile.mock.calls.filter(([cmd, args]) => cmd === "docker" && args[2] === "mosquitto_passwd");
      expect(execCalls).toHaveLength(1);
    });

    test("user không visible sau khi ghi → throw lỗi cụ thể", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation((cmd, args, opts, cb) => {
        if (args[0] === "exec" && args.includes("grep")) return cb(new Error("not found"));
        return cb(null, "", "");
      });

      await expect(mod.upsertViaDockerExecPasswd("s1", "tok")).rejects.toThrow(
        "user not visible in container passwd after mosquitto_passwd"
      );
    });

    test("mọi container đều fail exec → throw lỗi cuối cùng", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      process.env.MQTT_BROKER_HUP_CONTAINER = "sc-mqtt";
      const { execFile, mod } = load();
      execFile.mockImplementation(failExec("container gone"));

      await expect(mod.upsertViaDockerExecPasswd("s1", "tok")).rejects.toThrow("container gone");
    });
  });

  describe("upsertViaDockerPasswd / upsertViaNativePasswd", () => {
    test("upsertViaDockerPasswd CLI disabled → throw", async () => {
      delete process.env.MQTT_DOCKER_CLI_ENABLED;
      const { mod } = load();
      await expect(mod.upsertViaDockerPasswd("/tmp/passwd", "s1", "tok", true)).rejects.toThrow(
        "MQTT_DOCKER_CLI_ENABLED is not true"
      );
    });

    test("upsertViaDockerPasswd createNew=true → truyền cờ -c", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.upsertViaDockerPasswd("/tmp/dir/passwd", "s1", "tok", true);

      const [, args] = execFile.mock.calls[0];
      expect(args).toEqual(
        expect.arrayContaining(["-b", "-c", "/cfg/passwd", "s1", "tok"])
      );
    });

    test("upsertViaDockerPasswd createNew=false → KHÔNG có cờ -c", async () => {
      process.env.MQTT_DOCKER_CLI_ENABLED = "true";
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.upsertViaDockerPasswd("/tmp/dir/passwd", "s1", "tok", false);

      const [, args] = execFile.mock.calls[0];
      expect(args).not.toContain("-c");
      expect(args).toEqual(expect.arrayContaining(["-b", "/cfg/passwd", "s1", "tok"]));
    });

    test("upsertViaNativePasswd createNew=true → gọi mosquitto_passwd -b -c", async () => {
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.upsertViaNativePasswd("/tmp/passwd", "s1", "tok", true);

      expect(execFile).toHaveBeenCalledWith(
        "mosquitto_passwd",
        ["-b", "-c", "/tmp/passwd", "s1", "tok"],
        expect.any(Object),
        expect.any(Function)
      );
    });

    test("upsertViaNativePasswd createNew=false → không có -c", async () => {
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.upsertViaNativePasswd("/tmp/passwd", "s1", "tok", false);

      expect(execFile).toHaveBeenCalledWith(
        "mosquitto_passwd",
        ["-b", "/tmp/passwd", "s1", "tok"],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe("removeViaDockerPasswd / removeViaNativePasswd", () => {
    test("removeViaDockerPasswd dùng cờ -D", async () => {
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.removeViaDockerPasswd("/tmp/dir/passwd", "s1");

      const [, args] = execFile.mock.calls[0];
      expect(args).toEqual(expect.arrayContaining(["mosquitto_passwd", "-D", "/cfg/passwd", "s1"]));
    });

    test("removeViaNativePasswd gọi mosquitto_passwd -D trực tiếp", async () => {
      const { execFile, mod } = load();
      execFile.mockImplementation(okExec());

      await mod.removeViaNativePasswd("/tmp/passwd", "s1");

      expect(execFile).toHaveBeenCalledWith(
        "mosquitto_passwd",
        ["-D", "/tmp/passwd", "s1"],
        expect.any(Object),
        expect.any(Function)
      );
    });
  });
});
