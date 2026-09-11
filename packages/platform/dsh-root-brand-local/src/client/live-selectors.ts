/**
 * 官方 UI 改写锚的**运行时解析**：从官方自己的样式标签里离线读出类名哈希，
 * 取代原先按版本写死的 `. _37cUPa_*` 选择器。
 *
 * 锚点选择理由：官方 client 包在自己注入的 `<style>` 上带
 * `data-plugin-css="<包路径>/<模块>.module.css"`，这是**包路径级**结构锚，
 * 不随构建哈希变化（2.0.4 的 `_37cUPa_` 与 2.0.5 的 `zNic4G_` 用同一段代码通吃）。
 *
 * 前缀长度是实测事实（两代均为 6 字符），不作为硬前提：
 * 唯一定位由「已知模块局部名的负向断言」保证 —— 前缀 + 局部名唯一者胜出。
 */

/** hero 栅格的模块 id（官方包路径级锚）。 */
export const HERO_SHELL_MODULE_ID = "@deepseek-ai/dsh-client-ui-conversation/HeroShell.module.css";
/** 统计条的模块 id。 */
export const STATS_LINE_MODULE_ID = "@deepseek-ai/dsh-client-ui-chat/StatsLine.module.css";

/** 解析结果：每个键都是完整类名（形如 `zNic4G_headlineText`）。 */
export interface LiveAnchors {
  readonly heroHeadline: string;
  readonly heroHeadlineText: string;
  readonly heroPreviewBadge: string;
  readonly statsLineRoot: string;
}

/** 每个锚点从哪个模块、用哪些局部名做负向断言。 */
const ANCHOR_MODULES = [
  {
    moduleId: HERO_SHELL_MODULE_ID,
    anchors: {
      heroHeadline: "headline",
      heroHeadlineText: "headlineText",
      heroPreviewBadge: "previewBadge",
    },
  },
  {
    moduleId: STATS_LINE_MODULE_ID,
    anchors: { statsLineRoot: "root" },
  },
] as const;

/** 所有等待解析的锚点名（诊断用）。 */
export const ANCHOR_NAMES = ANCHOR_MODULES.flatMap((entry) =>
  Object.keys(entry.anchors),
) as readonly (keyof LiveAnchors)[];

/** 含该局部名的完整类名候选（`_local` 后不得紧跟标识符字符，避免前缀误配）。 */
function candidatesFor(css: string, localName: string): string[] {
  const pattern = new RegExp(`\\.([A-Za-z0-9_]+)_${localName}(?![A-Za-z0-9_-])`, "g");
  return [...css.matchAll(pattern)].map((match) => `${match[1] as string}_${localName}`);
}

/** 候选集合里恰好一个前缀胜出；0 或多于 1 个都判为解析失败。 */
function resolveAnchor(css: string, localName: string): string | undefined {
  const candidates = [...new Set(candidatesFor(css, localName))];
  if (candidates.length !== 1) return undefined;
  return candidates[0];
}

/** 从一份官方 CSS 文本里解析一个模块的全部锚点。 */
function resolveModule(
  css: string,
  anchors: Record<string, string>,
): { resolved: Record<string, string>; missing: string[] } {
  const resolved: Record<string, string> = {};
  const missing: string[] = [];
  for (const [key, localName] of Object.entries(anchors)) {
    const className = resolveAnchor(css, localName);
    if (className === undefined) missing.push(key);
    else resolved[key] = className;
  }
  return { resolved, missing };
}

/**
 * 从 DOM 里已安装的官方样式标签解析全部锚点。
 * 只读官方标签；插件自己的样式标签带的是自身包路径，不会命中模块 id。
 */
export function resolveLiveAnchors(doc: Document): {
  anchors: Partial<LiveAnchors>;
  missing: (keyof LiveAnchors)[];
} {
  const anchors: Partial<Record<keyof LiveAnchors, string>> = {};
  const missing: (keyof LiveAnchors)[] = [];
  for (const { moduleId, anchors: moduleAnchors } of ANCHOR_MODULES) {
    const tag = doc.querySelector(`style[data-plugin-css="${moduleId}"]`);
    const css = tag?.textContent ?? "";
    const result = resolveModule(css, moduleAnchors as Record<string, string>);
    for (const [key, value] of Object.entries(result.resolved)) {
      anchors[key as keyof LiveAnchors] = value;
    }
    missing.push(...(result.missing as (keyof LiveAnchors)[]));
  }
  return { anchors, missing };
}

/** CSS 标识符安全的选择器：前缀以数字开头时改用属性选择器。 */
export function classSelector(className: string): string {
  return /^[0-9]/.test(className) ? `[class~="${className}"]` : `.${className}`;
}
