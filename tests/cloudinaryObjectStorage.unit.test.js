process.env.NODE_ENV = "test";

require("rootpath")();

jest.mock("cloudinary", () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
      destroy: jest.fn(),
    },
  },
}));

const cloudinary = require("cloudinary").v2;
const driver = require("kernels/storage/drivers/cloudinaryObjectStorage");

describe("cloudinaryObjectStorage driver", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CLOUDINARY_CLOUD_NAME = "demo-cloud";
    process.env.CLOUDINARY_API_KEY = "key123";
    process.env.CLOUDINARY_API_SECRET = "secret123";
    process.env.CLOUDINARY_UPLOAD_FOLDER = "serial-commander";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test("saveObject upload qua data URI, trả secure_url làm url cố định", async () => {
    cloudinary.uploader.upload.mockResolvedValue({
      public_id: "serial-commander/4/123-abc",
      secure_url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/serial-commander/4/123-abc.png",
    });

    const out = await driver.saveObject({
      buffer: Buffer.from("fake-image"),
      key: "4/123-abc.png",
      mimetype: "image/png",
    });

    expect(cloudinary.config).toHaveBeenCalledWith(
      expect.objectContaining({ cloud_name: "demo-cloud", api_key: "key123", api_secret: "secret123" })
    );
    const [dataUri, options] = cloudinary.uploader.upload.mock.calls[0];
    expect(dataUri).toMatch(/^data:image\/png;base64,/);
    expect(options).toMatchObject({ public_id: "4/123-abc", folder: "serial-commander", resource_type: "image" });
    expect(out).toEqual({
      key: "serial-commander/4/123-abc",
      url: "https://res.cloudinary.com/demo-cloud/image/upload/v1/serial-commander/4/123-abc.png",
      provider: "cloudinary",
    });
  });

  test("throw 503 khi thiếu CLOUDINARY_API_SECRET", async () => {
    delete process.env.CLOUDINARY_API_SECRET;

    await expect(
      driver.saveObject({ buffer: Buffer.from("x"), key: "1/a.png", mimetype: "image/png" })
    ).rejects.toMatchObject({ statusCode: 503, code: "UPLOAD_CLOUDINARY_NOT_CONFIGURED" });
  });

  test("deleteObject gọi cloudinary.uploader.destroy(key)", async () => {
    await driver.deleteObject("serial-commander/4/123-abc");

    expect(cloudinary.uploader.destroy).toHaveBeenCalledWith(
      "serial-commander/4/123-abc",
      { resource_type: "image" }
    );
  });

  test("deleteObject no-op khi key rỗng", async () => {
    await driver.deleteObject(null);
    expect(cloudinary.uploader.destroy).not.toHaveBeenCalled();
  });
});
