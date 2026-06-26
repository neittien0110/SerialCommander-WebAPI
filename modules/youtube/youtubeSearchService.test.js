process.env.NODE_ENV = "test";

require("rootpath")();

const ORIGINAL_ENV = { ...process.env };

describe("youtubeSearchService", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
    delete global.fetch;
  });

  function load() {
    return require("./youtubeSearchService");
  }

  describe("buildSearchQuery", () => {
    test("query rỗng → trả về topic đầu tiên trong YOUTUBE_PROJECT_TOPICS", () => {
      process.env.YOUTUBE_PROJECT_TOPICS = "topic one,topic two";
      const { buildSearchQuery } = load();
      expect(buildSearchQuery("")).toBe("topic one");
    });

    test("query rỗng và không cấu hình topics → fallback mặc định", () => {
      delete process.env.YOUTUBE_PROJECT_TOPICS;
      const { buildSearchQuery } = load();
      expect(buildSearchQuery("   ")).toBe("arduino serial uart");
    });

    test("có query → ghép với topic đầu tiên làm ngữ cảnh", () => {
      process.env.YOUTUBE_PROJECT_TOPICS = "esp32 uart";
      const { buildSearchQuery } = load();
      expect(buildSearchQuery("  flash firmware  ")).toBe("flash firmware esp32 uart");
    });
  });

  describe("isRelevantToProject", () => {
    test("true khi title chứa từ khóa liên quan project (không phân biệt hoa thường)", () => {
      const { isRelevantToProject } = load();
      expect(isRelevantToProject({ title: "Học lập trình ESP32 cơ bản" })).toBe(true);
    });

    test("true khi từ khóa nằm trong description", () => {
      const { isRelevantToProject } = load();
      expect(isRelevantToProject({ title: "Video lạ", description: "nói về giao tiếp UART" })).toBe(true);
    });

    test("false khi không khớp từ khóa nào", () => {
      const { isRelevantToProject } = load();
      expect(isRelevantToProject({ title: "Vlog du lịch Đà Lạt", channelTitle: "Du lịch TV" })).toBe(false);
    });

    test("không throw khi snippet null/undefined field", () => {
      const { isRelevantToProject } = load();
      expect(isRelevantToProject({})).toBe(false);
    });
  });

  describe("searchYoutube", () => {
    test("không có YOUTUBE_API_KEY → trả curated fallback, không gọi fetch", async () => {
      delete process.env.YOUTUBE_API_KEY;
      global.fetch = jest.fn();
      const { searchYoutube } = load();

      const out = await searchYoutube("esp32");

      expect(out.apiEnabled).toBe(false);
      expect(out.source).toBe("curated");
      expect(out.items).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test("có API key → gọi YouTube API, lọc bỏ video không liên quan project", async () => {
      process.env.YOUTUBE_API_KEY = "fake-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: { videoId: "v1" }, snippet: { title: "ESP32 UART tutorial", channelTitle: "C1" } },
            { id: { videoId: "v2" }, snippet: { title: "Du lịch Đà Lạt", channelTitle: "C2" } },
            { id: { videoId: "v3" }, snippet: { title: "Arduino serial debug", channelTitle: "C3" } },
          ],
        }),
      });
      const { searchYoutube } = load();

      const out = await searchYoutube("uart", 12);

      expect(out.apiEnabled).toBe(true);
      expect(out.source).toBe("youtube");
      expect(out.items.map((i) => i.id)).toEqual(["v1", "v3"]);
      expect(out.filteredOut).toBe(1);
    });

    test("cắt items theo maxResults dù còn nhiều video liên quan", async () => {
      process.env.YOUTUBE_API_KEY = "fake-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: { videoId: "v1" }, snippet: { title: "uart 1" } },
            { id: { videoId: "v2" }, snippet: { title: "uart 2" } },
            { id: { videoId: "v3" }, snippet: { title: "uart 3" } },
          ],
        }),
      });
      const { searchYoutube } = load();

      const out = await searchYoutube("uart", 2);

      expect(out.items).toHaveLength(2);
    });

    test("bỏ qua item thiếu videoId hoặc snippet", async () => {
      process.env.YOUTUBE_API_KEY = "fake-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [
            { id: {}, snippet: { title: "uart no id" } },
            { id: { videoId: "v9" }, snippet: null },
          ],
        }),
      });
      const { searchYoutube } = load();

      const out = await searchYoutube("uart");

      expect(out.items).toEqual([]);
    });

    test("API trả lỗi HTTP → throw với statusCode tương ứng (403 giữ nguyên)", async () => {
      process.env.YOUTUBE_API_KEY = "fake-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: "quota exceeded" } }),
      });
      const { searchYoutube } = load();

      await expect(searchYoutube("uart")).rejects.toMatchObject({
        message: "quota exceeded",
        statusCode: 403,
      });
    });

    test("API trả lỗi HTTP khác 403 → statusCode chuẩn hóa về 502", async () => {
      process.env.YOUTUBE_API_KEY = "fake-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      });
      const { searchYoutube } = load();

      await expect(searchYoutube("uart")).rejects.toMatchObject({ statusCode: 502 });
    });

    test("response.json() lỗi parse → vẫn không crash, coi như items rỗng", async () => {
      process.env.YOUTUBE_API_KEY = "fake-key";
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("invalid json");
        },
      });
      const { searchYoutube } = load();

      const out = await searchYoutube("uart");
      expect(out.items).toEqual([]);
    });
  });
});
