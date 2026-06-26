afterEach(() => jest.resetModules());

function fresh() {
  jest.resetModules();
  return require("../kernels/metrics/appMetrics");
}

describe("appMetrics", () => {
  describe("inc", () => {
    test("tăng counter từ 0", () => {
      const { inc, getCountersSnapshot } = fresh();
      inc("http_requests");
      expect(getCountersSnapshot().http_requests).toBe(1);
    });

    test("tích lũy đúng khi gọi nhiều lần", () => {
      const { inc, getCountersSnapshot } = fresh();
      inc("http_errors");
      inc("http_errors");
      inc("http_errors", 5);
      expect(getCountersSnapshot().http_errors).toBe(7);
    });

    test("delta mặc định là 1", () => {
      const { inc, getCountersSnapshot } = fresh();
      inc("hits");
      inc("hits");
      expect(getCountersSnapshot().hits).toBe(2);
    });
  });

  describe("recordLatency", () => {
    test("khởi tạo metric lần đầu với giá trị đúng", () => {
      const { recordLatency, getLatencyGaugeSnapshot } = fresh();
      recordLatency("db_query", 120);
      const snap = getLatencyGaugeSnapshot();
      expect(snap.db_query_last_ms).toBe(120);
      expect(snap.db_query_avg_ms).toBe(120);
      expect(snap.db_query_max_ms).toBe(120);
    });

    test("tích lũy avg và max đúng qua nhiều lần ghi", () => {
      const { recordLatency, getLatencyGaugeSnapshot } = fresh();
      recordLatency("api", 100);
      recordLatency("api", 200);
      recordLatency("api", 50);
      const snap = getLatencyGaugeSnapshot();
      expect(snap.api_last_ms).toBe(50);
      expect(snap.api_avg_ms).toBe(117); // Math.round((100+200+50)/3) = 117
      expect(snap.api_max_ms).toBe(200);
    });

    test("bỏ qua giá trị không hợp lệ (NaN/âm) → safeMs=0", () => {
      const { recordLatency, getLatencyGaugeSnapshot } = fresh();
      recordLatency("x", NaN);
      recordLatency("x", -10);
      const snap = getLatencyGaugeSnapshot();
      expect(snap.x_last_ms).toBe(0);
      expect(snap.x_max_ms).toBe(0);
    });

    test("không cập nhật max khi giá trị nhỏ hơn max hiện tại", () => {
      const { recordLatency, getLatencyGaugeSnapshot } = fresh();
      recordLatency("y", 500);
      recordLatency("y", 100);
      expect(getLatencyGaugeSnapshot().y_max_ms).toBe(500);
    });
  });

  describe("getCountersSnapshot", () => {
    test("trả về copy — không ảnh hưởng state gốc", () => {
      const { inc, getCountersSnapshot } = fresh();
      inc("c");
      const snap = getCountersSnapshot();
      snap.c = 999;
      // gọi lại, vẫn là 1 chứ không phải 999
      expect(getCountersSnapshot().c).toBe(1);
    });
  });

  describe("formatPrometheusExposition", () => {
    test("format counters thành Prometheus text", () => {
      const { formatPrometheusExposition } = fresh();
      const out = formatPrometheusExposition({}, { http_requests: 42 });
      expect(out).toContain("# TYPE http_requests counter");
      expect(out).toContain("http_requests 42");
      expect(out.endsWith("\n")).toBe(true);
    });

    test("format gauges thành Prometheus text", () => {
      const { formatPrometheusExposition } = fresh();
      const out = formatPrometheusExposition({ db_connections: 5 }, {});
      expect(out).toContain("# TYPE db_connections gauge");
      expect(out).toContain("db_connections 5");
    });

    test("bỏ qua null/undefined values", () => {
      const { formatPrometheusExposition } = fresh();
      const out = formatPrometheusExposition({ g1: null, g2: undefined, g3: 7 }, {});
      expect(out).not.toContain("g1");
      expect(out).not.toContain("g2");
      expect(out).toContain("g3 7");
    });

    test("dùng getCountersSnapshot() khi không truyền countersSnapshot", () => {
      const { inc, formatPrometheusExposition } = fresh();
      inc("auto_counter");
      const out = formatPrometheusExposition({});
      expect(out).toContain("auto_counter 1");
    });

    test("gauges=null/undefined không throw", () => {
      const { formatPrometheusExposition } = fresh();
      expect(() => formatPrometheusExposition(null, {})).not.toThrow();
      expect(() => formatPrometheusExposition(undefined, {})).not.toThrow();
    });
  });
});
