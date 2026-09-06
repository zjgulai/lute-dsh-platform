import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroRootBrand, RootMark, SidebarRootName } from "./brand.js";

describe("ROOT brand components", () => {
  it("renders the R∞T mark with brand bars and theme color inheritance", () => {
    const html = renderToStaticMarkup(RootMark({ size: 24, className: "fish" }));
    expect(html).toContain("<svg");
    expect(html).toContain('width="46"');
    expect(html).toContain('height="24"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('fill="#58B848"');
    expect(html).toContain('fill="#A8A8A8"');
  });

  it("renders the sidebar name as 路特创新 with the plugin scope", () => {
    const html = renderToStaticMarkup(SidebarRootName());
    expect(html).toContain("路特创新");
    expect(html).toContain('data-plugin="dsh-root-brand"');
  });

  it("renders the hero occupant with the product line and the plugin scope", () => {
    const html = renderToStaticMarkup(HeroRootBrand({ size: 34 }));
    expect(html).toContain("Artificial Business Intelligence Agentic");
    expect(html).toContain('data-plugin="dsh-root-brand"');
    expect(html).toContain('class="dsh-rb-hero"');
    expect(html).toContain('class="dsh-rb-hero-name"');
  });
});
