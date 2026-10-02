import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { templateRenderer } from "@/features/designs/template-renderer";
import { templateConfigSchema } from "@/lib/validation/schemas";

describe("deterministic-layout", () => {
  const dir = path.join(
    process.cwd(),
    "templates/brands/botoschool/poster-service-v1",
  );
  const config = templateConfigSchema.parse(
    JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8")),
  );
  const sourceSvg = readFileSync(path.join(dir, "template.svg"), "utf8");

  it("keeps coordinates, colors, fonts and frame sizes across contents", () => {
    const a = templateRenderer.renderSvg({
      sourceSvg,
      config,
      values: {
        label: "Formation",
        headline: "Titre A",
        subtitle: "Sous-titre A pour le rendu",
        cta: "Start",
        mainImage: "https://example.com/a.jpg",
      },
    });
    const b = templateRenderer.renderSvg({
      sourceSvg,
      config,
      values: {
        label: "Atelier",
        headline: "Titre B",
        subtitle: "Sous-titre B pour le rendu",
        cta: "Go",
        mainImage: "https://example.com/b.jpg",
      },
    });

    expect(a.svg).toContain('width="1080"');
    expect(b.svg).toContain('width="1080"');
    expect(a.svg).toContain('height="1350"');
    expect(b.svg).toContain('height="1350"');
    expect(a.svg).toContain('fill="#D7FF00"');
    expect(b.svg).toContain('fill="#D7FF00"');
    expect(a.svg).toContain('font-family="Inter, Arial"');
    expect(b.svg).toContain('font-family="Inter, Arial"');
    expect(a.svg).toContain('x="64" y="64" width="952" height="720"');
    expect(b.svg).toContain('x="64" y="64" width="952" height="720"');
    expect(a.svg).toContain('cx="980" cy="80" r="28"');
    expect(b.svg).toContain('cx="980" cy="80" r="28"');
  });
});
