import { describe, expect, it } from "vitest";
import { BRAND_CSS, BRAND_CSS_STYLE_ID } from "./brand.js";

describe("brand CSS pins", () => {
  it("hides the native hero headline and preview badge (version-pinned)", () => {
    expect(BRAND_CSS).toContain("._37cUPa_headlineText, ._37cUPa_previewBadge { display: none; }");
    expect(BRAND_CSS).toContain("._37cUPa_headline { grid-template-columns: auto; }");
  });

  it("keeps a stable style tag id for the releasable install", () => {
    expect(BRAND_CSS_STYLE_ID).toBe("dsh-root-brand-css");
    expect(BRAND_CSS).toContain("data-plugin=\"dsh-root-brand\"");
  });
});
