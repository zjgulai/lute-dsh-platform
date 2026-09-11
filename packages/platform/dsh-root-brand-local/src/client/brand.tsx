import type { CSSProperties, ReactElement } from "react";
import { jsx, jsxs } from "react/jsx-runtime";

import { classSelector, type LiveAnchors } from "./live-selectors.js";

/**
 * ROOT (路特创新) brand components.
 *
 * The mark is a geometric re-draw of the reference wordmark: a stroke-built
 * "R∞T" monogram (OO of ROOT rendered as the infinity loop), the three rounded
 * brand bars underneath (green / gray / green), and the Chinese wordmark
 * rendered as styled text so it follows the active UI font stack.
 *
 * Theme adaptation: letterforms use `currentColor` (inherits `--dsw-alias-label-primary`
 * through the host brand seat), so the mark stays legible in light and dark
 * themes. The brand green and bar gray are fixed brand colors.
 */

/** Brand green sampled from the reference artwork (#58b848 core bucket). */
export const BRAND_GREEN = "#58B848";
/** Neutral bar gray sampled from the reference artwork. */
export const BAR_GRAY = "#A8A8A8";
/** Reference wordmark aspect (viewBox 61 x 32). */
const MARK_ASPECT = 61 / 32;

export interface BrandMarkProps {
  /** Requested square edge in pixels (host hands `size` into the slot). */
  size?: number;
  className?: string;
}

/** Stroke-built R∞T monogram with the three brand bars. */
export function RootMark({ size = 24, className }: BrandMarkProps): ReactElement {
  const width = Math.round(size * MARK_ASPECT);
  return jsx(
    "svg",
    {
      className,
      width,
      height: size,
      viewBox: "0 0 61 32",
      fill: "none",
      "aria-hidden": "true",
      children: jsxs("g", {
        stroke: "currentColor",
        strokeWidth: 4.2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        children: [
          // R
          jsx("path", { d: "M6.5 20 V3 H14.5 C18.6 3 21.5 5.9 21.5 9.8 C21.5 13.7 18.6 16.5 14 16.5 H6.5" }),
          jsx("path", { d: "M14 16.5 L20.5 20" }),
          // ∞ (the OO of ROOT)
          jsx("path", {
            d: "M32.75 11.75 C32.75 6.3 25.5 6.3 25.5 11.75 C25.5 17.2 32.75 17.2 32.75 11.75 C32.75 6.3 40 6.3 40 11.75 C40 17.2 32.75 17.2 32.75 11.75",
          }),
          // T
          jsx("path", { d: "M45.5 3 H57" }),
          jsx("path", { d: "M51.25 3 V20" }),
          // brand bars
          jsx("rect", { x: 6.5, y: 26, width: 16.5, height: 5, rx: 2.5, fill: BRAND_GREEN, stroke: "none" }),
          jsx("rect", { x: 25.5, y: 26, width: 16.5, height: 5, rx: 2.5, fill: BAR_GRAY, stroke: "none" }),
          jsx("rect", { x: 44, y: 26, width: 16.5, height: 5, rx: 2.5, fill: BRAND_GREEN, stroke: "none" }),
        ],
      }),
    },
  );
}

/**
 * Sidebar brand-name occupant: 路特创新 wordmark + the "AgenticOS" badge.
 *
 * 宿主名字槽仅约 114px 宽（mark 由 host 固定 size=24），一行须压缩：
 * 名字 11px/字距0.5 + 徽标 8px 紧凑胶囊（fit-content，不拉伸）。
 * 蒙版用纯渐变+描边+辉光（不用 backdrop-filter，避免 Electron 叠层合成下不渲染）。
 */
export function SidebarRootName(): ReactElement {
  return jsxs("span", {
    "data-plugin": "dsh-root-brand",
    className: "dsh-rb-name",
    children: [
      "路特创新",
      jsx("span", { className: "dsh-rb-agentic", children: "AgenticOS" }),
    ],
  });
}

/** Empty-session hero occupant: ROOT mark + the product line. */
export function HeroRootBrand({ size = 34, className }: BrandMarkProps): ReactElement {
  return jsxs("div", {
    "data-plugin": "dsh-root-brand",
    className: "dsh-rb-hero",
    children: [
      jsx(RootMark, { size, className }),
      jsx("span", { className: "dsh-rb-hero-name", children: "Artificial Business Intelligence Agentic" }),
    ],
  });
}

/**
 * Brand surface styles (version-independent part).
 *
 * `hero.headline` / `hero.preview` are not public slots (they are owned by the
 * conversation package's private locale namespace), so the native headline and
 * preview badge have to be hidden from the outside — but **not** with hashed
 * class names written into this file. The hash-bearing rules are produced at
 * runtime by {@link buildBrandCss} from the anchors read out of the official
 * stylesheets (see `live-selectors.ts`), so an upstream re-hash no longer
 * breaks the skin.
 */
export const BRAND_CSS = `
[data-plugin="dsh-root-brand"].dsh-rb-hero {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  max-width: 560px;
  color: var(--dsw-alias-label-primary);
}
[data-plugin="dsh-root-brand"].dsh-rb-hero .dsh-rb-hero-name {
  font-size: 18px;
  font-weight: 500;
  line-height: 26px;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
[data-plugin="dsh-root-brand"].dsh-rb-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  color: ${BRAND_GREEN};
  font-weight: 600;
  font-size: 11px;
  line-height: 18px;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
/* "AgenticOS" badge — 胶囊结构 + 品牌绿玻璃辉光（一行紧凑版，适配 ~114px 名字槽） */
[data-plugin="dsh-root-brand"] .dsh-rb-agentic {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  width: fit-content;
  height: 15px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0;
  white-space: nowrap;
  flex: 0 0 auto;
  color: var(--dsw-alias-label-primary, #e8e8ea);
  background: linear-gradient(120deg, rgba(88, 184, 72, 0.34), rgba(88, 184, 72, 0.12));
  border: 1px solid rgba(88, 184, 72, 0.65);
  box-shadow: 0 0 8px rgba(88, 184, 72, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.10);
}
[data-plugin="dsh-root-brand"] .dsh-rb-agentic::before {
  content: "";
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--dsw-alias-state-business-primary, #58b848);
}
@media (max-width: 640px) {
  [data-plugin="dsh-root-brand"].dsh-rb-hero .dsh-rb-hero-name { font-size: 14px; }
}

/* P1.5a 统计条折叠的视觉留在下面（选择器由 live-selectors 在运行时解析）。 */

/* P2 键盘可达性：覆写区与 hero 的 focus ring（品牌绿描边） */
.dshro-action:focus-within,
[data-plugin="dsh-root-brand"].dsh-rb-hero:focus-within {
  outline: 2px solid var(--dsw-alias-state-business-primary, #58b848);
  outline-offset: 2px;
}
.dshro-a:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #58b848);
  outline-offset: 2px;
}
.dshro-advanced summary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #58b848);
  outline-offset: 2px;
  border-radius: 4px;
}
`;

export const BRAND_CSS_STYLE_ID = "dsh-root-brand-css";

/**
 * Hash-bearing rules, assembled from the anchors read out of the official
 * stylesheets. Empty when an anchor is missing — the version-independent part
 * above stays installed either way, and the caller reports the miss.
 *
 * 覆盖声明一律带 `!important`：官方 HeroShell 规则与这里的选择器**特异性相同**
 * （都是单个类名，0-1-0），谁在 `<head>` 里靠后谁赢。官方样式标签由 conversation
 * 包在模块求值期注入，本插件的锚点标签何时创建取决于两侧加载次序 —— 一旦插件标签
 * 排在官方之前，`grid-template-columns: 34px auto auto` 就反压回来：品牌槽宽度
 * 397px 被塞进 34px 轨道、溢出并与 `previewBadge` 重叠（2.0.5 实测症状：空会话
 * hero 的 Preview 角标错位）。用 `!important` 让结果与注入顺序无关。
 */
export function buildBrandCss(anchors: Partial<LiveAnchors>): string {
  const rules: string[] = [];
  const { heroHeadline, heroHeadlineText, heroPreviewBadge, statsLineRoot } = anchors;

  if (heroHeadlineText !== undefined) {
    rules.push(`${classSelector(heroHeadlineText)} { display: none !important; }`);
  }
  if (heroHeadline !== undefined) {
    rules.push(`${classSelector(heroHeadline)} { grid-template-columns: auto !important; }`);
  }
  if (statsLineRoot !== undefined) {
    const root = classSelector(statsLineRoot);
    rules.push(
      `${root} { max-height: 6px !important; opacity: 0.45 !important; transition: max-height 0.18s ease, opacity 0.18s ease; }`,
      `${root}:hover { max-height: 28px !important; opacity: 1 !important; }`,
      `${root}::after { content: ""; display: block; height: 2px; width: 34px; margin: 2px auto 0; border-radius: 2px; background: var(--dsw-alias-separator-primary, rgba(127, 127, 127, 0.5)); transition: opacity 0.18s ease; }`,
      `${root}:hover::after { opacity: 0; }`,
    );
  }
  return rules.join("\n");
}

/** Install the brand style tag; returns a disposer that removes it. */
export function installBrandCss(anchors: Partial<LiveAnchors> = {}): () => void {
  if (typeof document === "undefined") return () => {};
  if (document.getElementById(BRAND_CSS_STYLE_ID) !== null) return () => {};
  const tag = document.createElement("style");
  tag.id = BRAND_CSS_STYLE_ID;
  tag.dataset.plugin = "dsh-root-brand";
  tag.textContent = `${BRAND_CSS}\n${buildBrandCss(anchors)}`;
  document.head.appendChild(tag);
  return () => {
    document.getElementById(BRAND_CSS_STYLE_ID)?.remove();
  };
}

/** Shared brand-name style blocks (kept small; the span carries the class). */
export const BRAND_NAME_STYLE: CSSProperties = {};
