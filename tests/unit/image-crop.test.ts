import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MAX_IMAGE_BYTES, imageCropService } from "@/features/designs/image-crop-service";

async function solidImage(
  width: number,
  height: number,
  format: "png" | "jpeg" | "webp",
): Promise<Buffer> {
  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 40, b: 80 },
    },
  });
  if (format === "jpeg") return base.jpeg().toBuffer();
  if (format === "webp") return base.webp().toBuffer();
  return base.png().toBuffer();
}

describe("image-crop", () => {
  it("crops PNG without distortion to exact target size", async () => {
    const buffer = await solidImage(1200, 1500, "png");
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/png",
      targetWidth: 1080,
      targetHeight: 1350,
      minimumWidth: 800,
      minimumHeight: 1000,
      expectedRatio: "4:5",
      allowUpscale: false,
    });

    expect(result.success).toBe(true);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1350);
    expect(result.mimeType).toBe("image/png");
    expect(result.outputBuffer.length).toBeGreaterThan(0);
    expect(result.cropArea.width).toBeGreaterThan(0);
    expect(result.cropArea.height).toBeGreaterThan(0);
    expect(result.width / result.height).toBeCloseTo(1080 / 1350, 5);
  });

  it("accepts JPEG input", async () => {
    const buffer = await solidImage(1200, 1500, "jpeg");
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/jpeg",
      targetWidth: 1080,
      targetHeight: 1350,
      minimumWidth: 800,
      minimumHeight: 1000,
      expectedRatio: "4:5",
    });
    expect(result.success).toBe(true);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("accepts WEBP input", async () => {
    const buffer = await solidImage(1200, 1500, "webp");
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/webp",
      targetWidth: 1080,
      targetHeight: 1350,
      minimumWidth: 800,
      minimumHeight: 1000,
      expectedRatio: "4:5",
    });
    expect(result.success).toBe(true);
    expect(result.mimeType).toBe("image/webp");
  });

  it("rejects svg mime type", async () => {
    const result = await imageCropService.crop({
      buffer: Buffer.from("<svg></svg>"),
      mimeType: "image/svg+xml",
      targetWidth: 100,
      targetHeight: 100,
      minimumWidth: 10,
      minimumHeight: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("IMAGE_MIME_FORBIDDEN");
  });

  it("rejects files that are too small", async () => {
    const buffer = await solidImage(400, 500, "png");
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/png",
      targetWidth: 1080,
      targetHeight: 1350,
      minimumWidth: 800,
      minimumHeight: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("IMAGE_TOO_SMALL");
  });

  it("rejects invalid source ratio vs expectedRatio", async () => {
    const buffer = await solidImage(2000, 400, "png");
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/png",
      targetWidth: 1080,
      targetHeight: 1350,
      minimumWidth: 100,
      minimumHeight: 100,
      expectedRatio: "4:5",
      allowUpscale: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("IMAGE_RATIO_INVALID");
  });

  it("rejects upscale when forbidden", async () => {
    const buffer = await solidImage(900, 1100, "png");
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/png",
      targetWidth: 1080,
      targetHeight: 1350,
      minimumWidth: 800,
      minimumHeight: 1000,
      allowUpscale: false,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("IMAGE_UPSCALE_FORBIDDEN");
  });

  it("rejects declared MIME that mismatches magic bytes", async () => {
    const buffer = await solidImage(1200, 1500, "png");
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/jpeg",
      targetWidth: 1080,
      targetHeight: 1350,
      minimumWidth: 800,
      minimumHeight: 1000,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("IMAGE_MIME_UNSUPPORTED");
  });

  it("rejects corrupt image payloads", async () => {
    const header = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    ]);
    const result = await imageCropService.crop({
      buffer: header,
      mimeType: "image/png",
      targetWidth: 100,
      targetHeight: 100,
      minimumWidth: 10,
      minimumHeight: 10,
      allowUpscale: true,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("IMAGE_CORRUPT");
  });

  it("rejects images larger than MAX_IMAGE_BYTES", async () => {
    const buffer = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1);
    buffer[0] = 0x89;
    buffer[1] = 0x50;
    buffer[2] = 0x4e;
    const result = await imageCropService.crop({
      buffer,
      mimeType: "image/png",
      targetWidth: 100,
      targetHeight: 100,
      minimumWidth: 10,
      minimumHeight: 10,
    });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("IMAGE_TOO_LARGE");
  });
});
