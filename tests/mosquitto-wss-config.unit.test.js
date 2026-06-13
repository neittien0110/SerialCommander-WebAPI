/**
 * Contract: cấu hình Mosquitto WSS dev + prod có listener TLS và cert paths.
 */
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..");

function readConf(relPath) {
  const full = path.join(REPO_ROOT, relPath);
  if (!fs.existsSync(full)) {
    throw new Error(`missing config file: ${relPath}`);
  }
  return fs.readFileSync(full, "utf8");
}

const hasWssConf = fs.existsSync(path.join(REPO_ROOT, "docker/mosquitto/mosquitto.wss.conf"));
const hasWssCompose = fs.existsSync(path.join(REPO_ROOT, "docker-compose.wss.yml"));

describe("mosquitto WSS configuration", () => {
  (hasWssConf ? test : test.skip)("docker/mosquitto/mosquitto.wss.conf — listener 9443 + cert files", () => {
    const conf = readConf("docker/mosquitto/mosquitto.wss.conf");
    expect(conf).toMatch(/listener\s+9443/);
    expect(conf).toMatch(/protocol\s+websockets/);
    expect(conf).toMatch(/certfile\s+\/mosquitto\/certs\/server\.crt/);
    expect(conf).toMatch(/keyfile\s+\/mosquitto\/certs\/server\.key/);
    expect(conf).not.toMatch(/listener\s+9001/);
  });

  test("scripts/mqtt-prod/mosquitto.conf — listener 8884 TLS cho production", () => {
    const conf = readConf("scripts/mqtt-prod/mosquitto.conf");
    expect(conf).toMatch(/listener\s+8884/);
    expect(conf).toMatch(/protocol\s+websockets/);
    expect(conf).toMatch(/certfile\s+\/mosquitto\/certs\//);
    expect(conf).toMatch(/bind_address\s+127\.0\.0\.1/);
  });

  (hasWssCompose ? test : test.skip)("docker-compose.wss.yml — publish 9443, dùng mosquitto.wss.conf", () => {
    const compose = readConf("docker-compose.wss.yml");
    expect(compose).toMatch(/MQTT_WSS_PORT.*9443/);
    expect(compose).not.toMatch(/9001:9001/);
    expect(compose).toMatch(/mosquitto\.wss\.conf/);
  });
});
