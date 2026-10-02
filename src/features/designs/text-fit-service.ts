export interface TextBox {
  width: number;
  height: number;
  fontSize: { default: number; min: number; max: number };
  maxLines: number;
  fontFamily: string;
}

export interface TextFitResult {
  success: boolean;
  renderedText: string;
  fontSize: number;
  lineCount: number;
  overflow: boolean;
  lines: string[];
  reason?: "TEXT_OVERFLOW";
}

export class TextFitError extends Error {
  readonly code = "TEXT_OVERFLOW" as const;

  constructor(message = "TEXT_OVERFLOW") {
    super(message);
    this.name = "TextFitError";
  }
}

/** Deterministic average glyph width factors by font family (no native canvas). */
const FONT_WIDTH_FACTORS: Record<string, number> = {
  Inter: 0.55,
  Arial: 0.56,
  Helvetica: 0.55,
  Roboto: 0.54,
};

const DEFAULT_CHAR_WIDTH_FACTOR = 0.55;
const LINE_HEIGHT_FACTOR = 1.2;

function glyphWidthFactor(fontFamily: string): number {
  const primary = fontFamily.split(",")[0]?.trim() ?? fontFamily;
  return FONT_WIDTH_FACTORS[primary] ?? DEFAULT_CHAR_WIDTH_FACTOR;
}

export function measureLineWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
): number {
  return text.length * fontSize * glyphWidthFactor(fontFamily);
}

export function measureBlock(
  lines: string[],
  fontSize: number,
  fontFamily = "Inter",
): { width: number; height: number } {
  const width =
    lines.length === 0
      ? 0
      : Math.max(
          ...lines.map((line) => measureLineWidth(line, fontSize, fontFamily)),
        );
  const height = lines.length * fontSize * LINE_HEIGHT_FACTOR;
  return { width, height };
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (measureLineWidth(next, fontSize, fontFamily) <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function fits(
  box: TextBox,
  fontSize: number,
  lines: string[],
): boolean {
  if (lines.length === 0) return true;
  if (lines.length > box.maxLines) return false;

  const block = measureBlock(lines, fontSize, box.fontFamily);
  if (block.height > box.height) return false;

  return lines.every(
    (line) => measureLineWidth(line, fontSize, box.fontFamily) <= box.width,
  );
}

function toResult(
  success: boolean,
  fontSize: number,
  lines: string[],
  reason?: "TEXT_OVERFLOW",
): TextFitResult {
  return {
    success,
    renderedText: lines.join("\n"),
    fontSize,
    lineCount: lines.length,
    overflow: !success,
    lines,
    ...(reason ? { reason } : {}),
  };
}

/**
 * Deterministic text fit: normalize → wrap → shrink to min → refuse.
 * Never moves, widens, or mutates the text box; never shrinks below min.
 */
export class TextFitService {
  fit(text: string, box: TextBox): TextFitResult {
    const width = box.width;
    const height = box.height;
    const maxLines = box.maxLines;
    const fontFamily = box.fontFamily;
    const minSize = box.fontSize.min;
    const defaultSize = box.fontSize.default;
    const normalized = normalizeSpaces(text);

    for (let size = defaultSize; size >= minSize; size -= 1) {
      const lines = wrapText(normalized, width, size, fontFamily);
      if (fits({ ...box, width, height, maxLines, fontFamily }, size, lines)) {
        return toResult(true, size, lines);
      }
    }

    const lines = wrapText(normalized, width, minSize, fontFamily);
    return toResult(false, minSize, lines, "TEXT_OVERFLOW");
  }

  fitOrThrow(text: string, box: TextBox, fieldName?: string): TextFitResult {
    const result = this.fit(text, box);
    if (!result.success) {
      throw new TextFitError(
        fieldName ? `TEXT_OVERFLOW:${fieldName}` : "TEXT_OVERFLOW",
      );
    }
    return result;
  }
}

export const textFitService = new TextFitService();
