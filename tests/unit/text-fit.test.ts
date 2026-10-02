import { describe, expect, it } from "vitest";
import {
  textFitService,
  type TextBox,
} from "@/features/designs/text-fit-service";

describe("text-fit", () => {
  const box: TextBox = {
    width: 400,
    height: 120,
    fontSize: { default: 32, min: 26, max: 32 },
    maxLines: 3,
    fontFamily: "Inter",
  };

  it("wraps lines without moving the box", () => {
    const frozen: TextBox = Object.freeze({
      ...box,
      fontSize: Object.freeze({ ...box.fontSize }),
    });
    const before = {
      width: frozen.width,
      height: frozen.height,
      maxLines: frozen.maxLines,
      fontSize: { ...frozen.fontSize },
    };

    const result = textFitService.fit(
      "Un texte un peu long pour forcer un retour à la ligne",
      frozen,
    );

    expect(result.success).toBe(true);
    expect(result.overflow).toBe(false);
    expect(result.lines.length).toBeGreaterThan(1);
    expect(result.lines.length).toBeLessThanOrEqual(frozen.maxLines);
    expect(result.lineCount).toBe(result.lines.length);
    expect(result.renderedText).toBe(result.lines.join("\n"));
    expect(frozen.width).toBe(before.width);
    expect(frozen.height).toBe(before.height);
    expect(frozen.maxLines).toBe(before.maxLines);
    expect(frozen.fontSize).toEqual(before.fontSize);
  });

  it("shrinks font only down to minimum", () => {
    const shrinkBox: TextBox = {
      width: 150,
      height: 100,
      fontSize: { default: 36, min: 20, max: 36 },
      maxLines: 2,
      fontFamily: "Inter",
    };
    const result = textFitService.fit("aaaa bbbb cccc dddd", shrinkBox);

    expect(result.success).toBe(true);
    expect(result.fontSize).toBeLessThan(shrinkBox.fontSize.default);
    expect(result.fontSize).toBeGreaterThanOrEqual(shrinkBox.fontSize.min);
    expect(result.overflow).toBe(false);
  });

  it("refuses when text still overflows at min size", () => {
    const result = textFitService.fit("mot".repeat(80), {
      width: 80,
      height: 40,
      fontSize: { default: 24, min: 22, max: 24 },
      maxLines: 1,
      fontFamily: "Inter",
    });
    expect(result.success).toBe(false);
    expect(result.overflow).toBe(true);
    expect(result.reason).toBe("TEXT_OVERFLOW");
    expect(result.fontSize).toBeGreaterThanOrEqual(22);
    expect(result.fontSize).toBe(22);
  });

  it("never returns a fontSize below min even on overflow", () => {
    const min = 22;
    const result = textFitService.fit("x".repeat(500), {
      width: 50,
      height: 20,
      fontSize: { default: 28, min, max: 28 },
      maxLines: 1,
      fontFamily: "Arial",
    });
    expect(result.success).toBe(false);
    expect(result.fontSize).toBe(min);
  });
});
