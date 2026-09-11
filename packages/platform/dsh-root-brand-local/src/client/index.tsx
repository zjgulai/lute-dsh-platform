import { jsx } from "react/jsx-runtime";
import { HeroRootBrand, RootMark, SidebarRootName, buildBrandCss, installBrandCss } from "./brand.js";
import { classSelector, type LiveAnchors, resolveLiveAnchors } from "./live-selectors.js";
import { observePreviewText } from "./official-text.js";

/** Required Cordis services: the UI slot registry. */
export const inject = ["slots"];

/**
 * Minimal slot registry shape needed by the client surface.
 */
export interface SlotsService {
  inject(slot: string, register: () => unknown): unknown;
  register(options: { name: string; priority?: number }, component: unknown): unknown;
}

export interface ClientContext {
  slots: SlotsService;
  effect(fn: () => () => void, label: string): void;
}

const ANCHOR_STYLE_ID = "dsh-root-brand-anchors";
const ANCHORS_STATE_ATTR = "dshRootBrandAnchors";

/** 校验选择器：写进 querySelector 的类名必须是安全标识符（避免抛出并整块跳过）。 */
const SELECTOR_SAFE = /^[A-Za-z0-9_-]+$/;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 单次同步：读锚点、把 hash 规则交给写入方、维护角标观察、记录漂移状态。
 * 任何官方节点缺失都不抛错（只记 degraded），保证与版本无关的样式先落地。
 */
function syncOnce(doc: Document, writeRules: (rules: string) => void): (keyof LiveAnchors)[] {
  const { anchors, missing } = resolveLiveAnchors(doc);
  writeRules(buildBrandCss(anchors));

  // 角标保持官方节点与外观，只把文案改成 Preview。
  const previewSelector = anchors.heroPreviewBadge;
  if (previewSelector !== undefined && SELECTOR_SAFE.test(previewSelector)) {
    const badge = doc.querySelector<HTMLElement>(classSelector(previewSelector));
    if (badge !== null && badge.dataset.dshRbPreview === undefined) {
      badge.dataset.dshRbPreview = "1";
      try {
        observePreviewText(badge);
      } catch (error) {
        console.warn(`[dsh-root-brand] 角标改写失败：${describeError(error)}`);
      }
    }
  }

  const state = missing.length === 0 ? "resolved" : `degraded:${missing.join(",")}`;
  doc.documentElement.dataset[ANCHORS_STATE_ATTR] = state;
  if (missing.length === 0) {
    console.info("[dsh-root-brand] anchors resolved");
  } else {
    console.warn(`[dsh-root-brand] anchor drift: 未解析 ${missing.join(", ")}`);
  }
  return missing;
}

/**
 * 首次同步 + 持续重试：官方样式标签与官方 hero **都可能晚于插件启动才出现**
 * （样式按需注入、hero 在空会话渲染时才挂载），因此观察整个文档子树的新增节点，
 * 每次新增都重新解析一次。disposer 需要把角标改写一并还原（卸载后不留残余）。
 *
 * 写入时把标签**移到 head 末尾**（appendChild 移动既有节点）：与官方同特异性的
 * 覆盖规则因此恒在其后，级联顺序不再取决于两侧加载次序。`!important`（见
 * buildBrandCss）是第一道保险，这里是第二道。
 */
function watchAnchors(doc: Document): () => void {
  let disposePreview: (() => void) | undefined;
  let lastRules: string | undefined;

  const sync = (): void => {
    const missing = syncOnce(doc, (rules) => {
      if (lastRules === rules) return;
      lastRules = rules;
      let tag = doc.getElementById(ANCHOR_STYLE_ID);
      if (tag === null) {
        tag = doc.createElement("style");
        tag.id = ANCHOR_STYLE_ID;
        tag.dataset.plugin = "dsh-root-brand";
      }
      tag.textContent = rules;
      doc.head.appendChild(tag);
    });

    void missing;
    if (disposePreview !== undefined) return;
    const badge = doc.querySelector<HTMLElement>("[data-dsh-rb-preview]");
    if (badge === null) return;
    disposePreview = observePreviewText(badge);
  };

  sync();
  const observer = new MutationObserver(sync);
  observer.observe(doc.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    disposePreview?.();
    doc.querySelector("[data-dsh-rb-preview]")?.removeAttribute("data-dsh-rb-preview");
    doc.getElementById(ANCHOR_STYLE_ID)?.remove();
  };
}

/**
 * Override the three shipped brand seats at a lower shadowing priority than
 * the official registrations (priority 0): the slot registry elects the
 * lowest-priority entry, so the ROOT identity renders instead of the official
 * fish + wordmark, without disabling any official loader line.
 */
export function apply(ctx: ClientContext): void {
  const register = (name: string, component: unknown) =>
    ctx.slots.inject(name, () => ctx.slots.register({ name, priority: -100 }, component));

  register("sidebar.brand.mark", RootMark);
  register("sidebar.brand.name", SidebarRootName);
  register("conversation.hero.brand.mark", HeroRootBrand);

  ctx.effect(() => installBrandCss(), "dsh-root-brand: brand css");
  ctx.effect(() => watchAnchors(document), "dsh-root-brand: live anchors");
}

export { HeroRootBrand, RootMark, SidebarRootName };
