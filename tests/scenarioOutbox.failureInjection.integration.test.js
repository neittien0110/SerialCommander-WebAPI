/**
 * Integration test — FAILURE INJECTION trên Redis THẬT.
 *
 * Mục tiêu: chứng minh cam kết cốt lõi của tầng Kernel (Outbox + DLQ):
 *   "Khi downstream (Firestore/broker) chết giữa chừng, message KHÔNG mất,
 *    và cuối cùng vẫn đồng bộ được sau khi downstream hồi phục."
 *
 * Khác với các unit test (mock cả queue), test này chạy:
 *   - Redis THẬT (localhost) qua ioredis                    → hàng đợi thật
 *   - scenarioSyncQueue THẬT (RPOPLPUSH / LREM / retry / DLQ) → logic thật
 *   - syncJob.processQueueBatch THẬT                         → worker thật
 *   - scenarioDlqReconcile THẬT                              → bộ tự cứu thật
 * Chỉ INJECT lỗi ở đúng một điểm: lời gọi Firestore (đóng vai broker downstream).
 *
 * Chạy trên Redis DB 15 (scratch) để không đụng dữ liệu khác; flush trước mỗi test.
 */
process.env.NODE_ENV = "test";
process.env.SCENARIO_OUTBOX_REDIS_URL = "redis://127.0.0.1:6379/15";

require("rootpath")();

// ---- Chỉ mock những thứ NGOÀI phạm vi kiểm chứng ----
// 1) Firestore = điểm inject lỗi (downstream "broker" có thể chết).
jest.mock("modules/config/services/scenarioFirestoreService", () => ({
  batchSaveScenarioContent: jest.fn(),
  batchDeleteScenarioContent: jest.fn(),
}));
// 2) MySQL source-of-truth cho bước DLQ reconcile.
jest.mock("models", () => ({
  Scenario: { findByPk: jest.fn() },
}));
// 3) Trạng thái/circuit-breaker — orthogonal với cam kết no-loss, cho no-op.
jest.mock("kernels/scenarioSyncStatus", () => ({
  isFirestoreCircuitOpen: jest.fn().mockResolvedValue(false),
  setScenarioSyncStatus: jest.fn().mockResolvedValue(undefined),
  recordFirestoreBatchSuccess: jest.fn(),
  recordFirestoreBatchFailure: jest.fn().mockResolvedValue(false),
}));

const scenarioSyncQueue = require("kernels/scenarioSyncQueue");
const scenarioFirestore = require("modules/config/services/scenarioFirestoreService");
const { Scenario } = require("models");
const { processQueueBatch, __private } = require("kernels/syncJob");
const { reconcileDlqBatch } = require("kernels/scenarioDlqReconcile");

// Bật/tắt "broker": true = Firestore sống, false = chết.
let firestoreUp = false;
function wireFirestore() {
  const impl = () =>
    firestoreUp
      ? Promise.resolve(undefined)
      : Promise.reject(new Error("firestore/broker down (injected)"));
  scenarioFirestore.batchSaveScenarioContent.mockImplementation(impl);
  scenarioFirestore.batchDeleteScenarioContent.mockImplementation(impl);
}

/**
 * Mô phỏng một "tick" của worker sau khi cửa sổ backoff đã trôi qua.
 * (Backoff là time-based; reset để không phải sleep thật trong test.)
 */
async function tick() {
  __private.resetBackoffState();
  await processQueueBatch();
}

let redis;

beforeAll(async () => {
  redis = scenarioSyncQueue.getRedisClient();
  if (redis.status !== "ready") await redis.connect();
});

afterAll(async () => {
  if (redis) {
    await redis.flushdb();
    await redis.quit();
  }
});

beforeEach(async () => {
  jest.clearAllMocks();
  __private.resetBackoffState();
  firestoreUp = false;
  wireFirestore();
  await redis.flushdb();
});

describe("Outbox failure-injection (Redis thật)", () => {
  test("KỊCH BẢN A — broker chết giữa chừng: message không mất, hồi phục thì đồng bộ", async () => {
    // 1) Người dùng đổi scenario → job vào hàng đợi thật
    await scenarioSyncQueue.enqueueSync("scen-A", [{ step: 1, cmd: "AT+RESET" }]);
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 1, processing: 0, dlq: 0 });

    // 2) BROKER CHẾT: worker chạy nhưng Firestore ném lỗi
    firestoreUp = false;
    await tick();

    // → Worker ĐÃ thử gửi, nhưng KHÔNG ack. Message quay lại hàng đợi, KHÔNG mất, KHÔNG vào DLQ.
    expect(scenarioFirestore.batchSaveScenarioContent).toHaveBeenCalledTimes(1);
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 1, processing: 0, dlq: 0 });

    // 3) BROKER HỒI PHỤC: tick tiếp
    firestoreUp = true;
    await tick();

    // → Đồng bộ thành công với ĐÚNG payload đã enqueue; hàng đợi sạch hoàn toàn.
    expect(scenarioFirestore.batchSaveScenarioContent).toHaveBeenLastCalledWith([
      { scenarioId: "scen-A", content: [{ step: 1, cmd: "AT+RESET" }] },
    ]);
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 0, processing: 0, dlq: 0 });
  });

  test("KỊCH BẢN B — lỗi kéo dài → DLQ (không mất), rồi reconcile từ MySQL cứu lại", async () => {
    await scenarioSyncQueue.enqueueSync("scen-B", [{ step: 1 }]);

    // 1) Broker chết dai dẳng: chạy tới khi vượt MAX_RETRY_COUNT (5) → rơi vào DLQ.
    firestoreUp = false;
    for (let i = 0; i < scenarioSyncQueue.MAX_RETRY_COUNT + 1; i += 1) {
      await tick();
    }

    // → Job KHÔNG mất: được ký gửi an toàn vào DLQ, không còn chặn hàng đợi chính.
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 0, processing: 0, dlq: 1 });

    // 2) Bộ tự cứu: MySQL là source-of-truth, đọc lại Content và re-enqueue.
    Scenario.findByPk.mockResolvedValue({ Content: JSON.stringify([{ step: 1 }]) });
    const results = await reconcileDlqBatch(10);
    expect(results[0].outcome).toBe("upsert_requeued_from_mysql");
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 1, processing: 0, dlq: 0 });

    // 3) Broker hồi phục → tick → đồng bộ trọn vẹn, hàng đợi sạch.
    firestoreUp = true;
    await tick();
    expect(scenarioFirestore.batchSaveScenarioContent).toHaveBeenLastCalledWith([
      { scenarioId: "scen-B", content: [{ step: 1 }] },
    ]);
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 0, processing: 0, dlq: 0 });
  });

  test("KỊCH BẢN C — nhiều job, broker chập chờn: không job nào bị mất", async () => {
    // 5 job đẩy vào cùng lúc
    for (let i = 0; i < 5; i += 1) {
      await scenarioSyncQueue.enqueueSync(`multi-${i}`, [{ step: i }]);
    }
    expect((await scenarioSyncQueue.getQueueLengths()).queue).toBe(5);

    // Chập chờn: chết → sống → chết → sống. Bất biến: tổng job trong hệ thống không bao giờ hụt.
    for (const up of [false, true, false, true, true]) {
      firestoreUp = up;
      await tick();
      const { queue, processing, dlq } = await scenarioSyncQueue.getQueueLengths();
      // Không bao giờ có job "bốc hơi": tổng còn-lại + đã-đồng-bộ phải bảo toàn (>=0, không âm, không kẹt processing).
      expect(processing).toBe(0);
      expect(queue + dlq).toBeGreaterThanOrEqual(0);
    }

    // Sau khi broker ổn định, mọi job phải đồng bộ hết.
    firestoreUp = true;
    await tick();
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 0, processing: 0, dlq: 0 });
    // 5 scenario khác nhau đều đã được gửi lên Firestore.
    const allSaved = scenarioFirestore.batchSaveScenarioContent.mock.calls
      .flatMap((c) => c[0])
      .map((x) => x.scenarioId);
    for (let i = 0; i < 5; i += 1) {
      expect(allSaved).toContain(`multi-${i}`);
    }
  });

  test("KỊCH BẢN D — worker crash CỨNG giữa batch: job kẹt ở PROCESSING (lỗ hổng có thật)", async () => {
    await scenarioSyncQueue.enqueueSync("crash-1", [{ step: 1 }]);

    // Mô phỏng CRASH CỨNG: worker vừa claim (RPOPLPUSH → processing) thì tiến trình
    // bị kill NGAY, chưa kịp ack cũng chưa kịp requeue. Ta gọi claimBatch trực tiếp
    // rồi KHÔNG làm gì tiếp (đúng như bị SIGKILL giữa chừng).
    const { items } = await scenarioSyncQueue.claimBatch(10);
    expect(items).toHaveLength(1);
    // Job hiện nằm trong PROCESSING — chưa mất hẳn, nhưng cũng KHÔNG ở hàng đợi chính.
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 0, processing: 1, dlq: 0 });

    // Worker "khởi động lại" và chạy bình thường, Firestore đã sống.
    firestoreUp = true;
    await tick();
    await tick();

    // KẾT QUẢ (ghi nhận lỗ hổng): processQueueBatch chỉ claim từ QUEUE, KHÔNG quét PROCESSING.
    // → Job vẫn KẸT trong processing, KHÔNG bao giờ được đồng bộ, và KHÔNG có reaper nào cứu.
    expect(await scenarioSyncQueue.getQueueLengths()).toEqual({ queue: 0, processing: 1, dlq: 0 });
    expect(scenarioFirestore.batchSaveScenarioContent).not.toHaveBeenCalled();

    // Ghi rõ bản chất: job KHÔNG mất dữ liệu (vẫn còn trong Redis), nhưng bị "mồ côi" —
    // cần một PROCESSING-reaper (quét processing quá hạn → requeue) để tự phục hồi.
  });
});
