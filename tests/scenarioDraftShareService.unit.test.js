process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("models", () => ({
  ScenarioDraftShare: {
    create: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
}));

const { ScenarioDraftShare } = require("models");
const service = require("modules/config/services/scenarioDraftShareService");

describe("scenarioDraftShareService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("createDraftShare: lưu content, trả code 12 ký tự hex + expiresAt tương lai", async () => {
    ScenarioDraftShare.create.mockResolvedValue({});

    const { code, expiresAt } = await service.createDraftShare('{"Name":"x"}');

    expect(code).toMatch(/^[a-f0-9]{12}$/);
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(ScenarioDraftShare.create).toHaveBeenCalledWith(
      expect.objectContaining({ Code: code, Content: '{"Name":"x"}' })
    );
  });

  test("getDraftShareContent: 404 khi không tồn tại", async () => {
    ScenarioDraftShare.findOne.mockResolvedValue(null);

    await expect(service.getDraftShareContent("missing1234")).rejects.toMatchObject({ statusCode: 404 });
  });

  test("getDraftShareContent: 404 + tự xoá khi hết hạn", async () => {
    const destroyMock = jest.fn().mockResolvedValue(undefined);
    ScenarioDraftShare.findOne.mockResolvedValue({
      Content: '{"Name":"x"}',
      ExpiresAt: new Date(Date.now() - 1000),
      destroy: destroyMock,
    });

    await expect(service.getDraftShareContent("expired12345")).rejects.toMatchObject({ statusCode: 404 });
    expect(destroyMock).toHaveBeenCalledTimes(1);
  });

  test("getDraftShareContent: trả Content khi còn hạn", async () => {
    ScenarioDraftShare.findOne.mockResolvedValue({
      Content: '{"Name":"x"}',
      ExpiresAt: new Date(Date.now() + 60_000),
    });

    const content = await service.getDraftShareContent("valid1234567");
    expect(content).toBe('{"Name":"x"}');
  });

  test("cleanupExpiredDraftShares: gọi destroy với điều kiện ExpiresAt < now, trả số bản ghi đã xoá", async () => {
    ScenarioDraftShare.destroy.mockResolvedValue(3);

    const deleted = await service.cleanupExpiredDraftShares();

    expect(deleted).toBe(3);
    expect(ScenarioDraftShare.destroy).toHaveBeenCalledTimes(1);
  });
});
