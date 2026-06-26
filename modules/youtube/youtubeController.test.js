process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("./youtubeSearchService");

const youtubeSearchService = require("./youtubeSearchService");
const controller = require("./youtubeController");

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

describe("youtubeController.searchVideos", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("trả 400 khi từ khóa quá dài (>120 ký tự), không gọi service", async () => {
    const req = { query: { q: "a".repeat(121) } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].error.code).toBe("YOUTUBE_QUERY_TOO_LONG");
    expect(youtubeSearchService.searchYoutube).not.toHaveBeenCalled();
  });

  test("clamp maxResults trong khoảng [1,20], mặc định 12 khi không hợp lệ", async () => {
    youtubeSearchService.searchYoutube.mockResolvedValue({ apiEnabled: true, items: [{ id: "v1" }] });
    const req = { query: { q: "uart", maxResults: "999" } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(youtubeSearchService.searchYoutube).toHaveBeenCalledWith("uart", 20);
  });

  test("maxResults không phải số → fallback 12", async () => {
    youtubeSearchService.searchYoutube.mockResolvedValue({ apiEnabled: true, items: [] });
    const req = { query: { q: "uart", maxResults: "abc" } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(youtubeSearchService.searchYoutube).toHaveBeenCalledWith("uart", 12);
  });

  test("apiEnabled=true, có q, 0 kết quả → trả emptyReason no_project_match", async () => {
    youtubeSearchService.searchYoutube.mockResolvedValue({ apiEnabled: true, items: [] });
    const req = { query: { q: "du lich da lat" } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].emptyReason).toBe("no_project_match");
  });

  test("apiEnabled=true, q rỗng, 0 kết quả → KHÔNG gắn emptyReason", async () => {
    youtubeSearchService.searchYoutube.mockResolvedValue({ apiEnabled: true, items: [] });
    const req = { query: {} };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(res.json.mock.calls[0][0].emptyReason).toBeUndefined();
  });

  test("apiEnabled=true, có kết quả → message thành công, không emptyReason", async () => {
    const result = { apiEnabled: true, items: [{ id: "v1" }] };
    youtubeSearchService.searchYoutube.mockResolvedValue(result);
    const req = { query: { q: "uart" } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(res.json.mock.calls[0][0].message).toBe("Tìm YouTube thành công.");
    expect(res.json.mock.calls[0][0].items).toEqual(result.items);
  });

  test("apiEnabled=false → message báo API chưa bật", async () => {
    youtubeSearchService.searchYoutube.mockResolvedValue({ apiEnabled: false, items: [] });
    const req = { query: { q: "uart" } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(res.json.mock.calls[0][0].message).toBe("YouTube API chưa bật trên server.");
  });

  test("service throw lỗi có statusCode → dùng đúng statusCode đó", async () => {
    const err = new Error("quota exceeded");
    err.statusCode = 403;
    youtubeSearchService.searchYoutube.mockRejectedValue(err);
    const req = { query: { q: "uart" } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].error.code).toBe("YOUTUBE_SEARCH_FAILED");
  });

  test("service throw lỗi không có statusCode → fallback 502", async () => {
    youtubeSearchService.searchYoutube.mockRejectedValue(new Error("network down"));
    const req = { query: { q: "uart" } };
    const res = mockRes();

    await controller.searchVideos(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });
});
