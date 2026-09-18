/**
 * 设置面板的测试 fixture。
 *
 * 形状照官方 `SettingsRoot` 的真实渲染结果构造：
 *   div[role=dialog][aria-modal=true] > nav > div(标题) + div(列表) > button*
 * 当前项带 `aria-current="true"`。
 *
 * **刻意不含任何 CSS-module 类名** —— 本包的可移植性正建立在
 * 「官方 DOM 的 ARIA 语义」上，fixture 也必须只依赖同一层契约，
 * 否则测试会在自己伪造的类名上通过、在真实产物上失败。
 */

/**
 * 2026-09-15 实测的设置 section 清单（18 项），顺序即渲染顺序。
 *
 * 来源：`ctx.slots.entries("settings.section")` 的返回顺序，
 * 与实际打开设置页读到的 DOM 顺序逐项对照过（order 依次为
 * 0,1,5,10,15,20,21,25,26,27,28,28,29,40,60,98,100,100）。
 * 这份清单是所有分组用例的输入事实 —— 改了它就要同步改 `groups.ts` 的登记表。
 */
export const MEASURED_SECTIONS = [
  "general",
  "pocket",
  "dsh-theme",
  "models",
  "plugins",
  "agent-presets",
  "xmanrui-dsh-im",
  "agent-teams",
  "overseas-skills",
  "fullstack-skills",
  "generic-skills",
  "wanzh-hulian",
  "algo-skills",
  "market",
  "noema-memory",
  "my-quotes",
  "better-sidebar",
  "desktop",
] as const;

export interface FixtureOptions {
  readonly sectionIds?: readonly string[];
  readonly activeIndex?: number;
  /** 破坏结构的方式，用来驱动 drift 分支。 */
  readonly broken?: "no-nav" | "split-parents" | "no-current" | "duplicate-current";
}

/** 官方形状的设置面板；页面上可再有别的 dialog 以模拟误伤场景。 */
export function settingsShellFixture(options: FixtureOptions = {}): Document {
  const ids = options.sectionIds ?? ["general", "models", "plugins"];
  const doc = document.implementation.createHTMLDocument("settings");
  doc.documentElement.lang = "zh-CN";

  const overlay = doc.createElement("div");
  overlay.setAttribute("role", "presentation");

  const mask = doc.createElement("div");
  mask.setAttribute("aria-hidden", "true");
  overlay.appendChild(mask);

  const panel = doc.createElement("div");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "settings-shell-fixture-title");

  if (options.broken !== "no-nav") {
    const nav = doc.createElement("nav");

    const title = doc.createElement("div");
    title.id = "settings-shell-fixture-title";
    title.textContent = "设置";
    nav.appendChild(title);

    const list = doc.createElement("div");
    ids.forEach((id, index) => {
      const button = doc.createElement("button");
      button.type = "button";
      const activeIndex = options.activeIndex ?? 0;
      const isCurrent = options.broken === "duplicate-current"
        ? index < 2
        : options.broken !== "no-current" && index === activeIndex;
      if (isCurrent) button.setAttribute("aria-current", "true");
      const label = doc.createElement("span");
      label.textContent = id;
      button.appendChild(label);
      // split-parents：把第二个按钮挪到另一个容器，模拟结构漂移。
      if (options.broken === "split-parents" && index === 1) {
        const other = doc.createElement("div");
        other.appendChild(button);
        nav.appendChild(other);
        return;
      }
      list.appendChild(button);
    });
    nav.appendChild(list);
    panel.appendChild(nav);
  }

  const content = doc.createElement("div");
  const header = doc.createElement("div");
  const actions = doc.createElement("div");
  const close = doc.createElement("button");
  close.type = "button";
  close.textContent = "关闭";
  header.appendChild(actions);
  header.appendChild(close);
  content.appendChild(header);
  content.appendChild(doc.createElement("div"));
  panel.appendChild(content);

  overlay.appendChild(panel);
  doc.body.appendChild(overlay);
  return doc;
}

/** 分组标题节点的文案，按 DOM 顺序。 */
export function groupTitles(doc: Document): string[] {
  return Array.from(doc.querySelectorAll("[data-dsh-ss-group]")).map(
    (node) => node.textContent ?? "",
  );
}
