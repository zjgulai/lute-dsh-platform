/**
 * 设置 shell 的**语义锚**。
 *
 * 为什么不用项目既有的 `style[data-plugin-css="<包路径>/<模块>.module.css"]` +
 * 局部名负向断言（`dsh-root-brand` 的 `live-selectors.ts`）？
 * 因为设置 shell 的 DOM **自带完整 ARIA**，而这些语义是**契约级**的、
 * 比包路径锚更强：官方 `SettingsRoot` 渲染的是
 * `div[role=dialog][aria-modal=true] > nav > div(navList) > button*`，
 * 其中 `aria-current="true"` 标当前项。ARIA 是给无障碍工具用的公开契约，
 * 上游改类名哈希不会动它；包路径锚反而多依赖一层「模块文件名」。
 *
 * 跨版本稳定性由此保证：**本文件不含任何 CSS-module 哈希**（架构红线第 7 条）。
 * 结构一旦不匹配，返回 `drift` 并自报，调用方降级为「保持官方原样」——
 * 绝不静默失效。
 */

/** 设置面板的公开 modal 语义。这只是候选集，不是足够的 Settings 身份证据。 */
const PANEL_SELECTOR = '[role="dialog"][aria-modal="true"]';

/** 只有 parser 成功后才会出现的 CSS 根 marker。 */
export const SHELL_ROOT_MARKER_ATTR = "data-dsh-settings-shell-root";

/** 解析成功后的可操作节点。 */
export interface SettingsShellDom {
  readonly panel: HTMLElement;
  readonly nav: HTMLElement;
  readonly navList: HTMLElement;
  readonly buttons: readonly HTMLButtonElement[];
}

/**
 * 解析结果三态。
 *
 * `absent` 与 `drift` 必须分开：前者是「设置页此刻没开」（正常，不该报警），
 * 后者是「开了但结构不是我们认识的样子」（真漂移，必须自报）。
 * 把两者混成一句「没找到」，就等于让结构漂移静默通过。
 */
export type SettingsShellResolution =
  | { readonly kind: "ok"; readonly dom: SettingsShellDom }
  | { readonly kind: "absent" }
  | { readonly kind: "drift"; readonly reason: string };

/** panel 的直接子元素里的 `<nav>`（不用 `:scope`，行为在各实现间更一致）。 */
function directNavChild(panel: Element): HTMLElement | undefined {
  for (const child of Array.from(panel.children)) {
    if (child.tagName === "NAV") return child as HTMLElement;
  }
  return undefined;
}

/**
 * 取导航列表容器：**所有**导航按钮的共同父元素。
 *
 * 不写 `nav > div:last-child` 这种结构猜法 —— 只要官方多插一个装饰性 div
 * 就会错位。改为从按钮反推父元素，并要求全部按钮同父，否则判为漂移。
 */
function resolveNavList(nav: HTMLElement): { list?: HTMLElement; reason?: string } {
  const buttons = Array.from(nav.querySelectorAll<HTMLButtonElement>("button"));
  const first = buttons[0];
  if (first === undefined) return { reason: "settings nav contains no buttons" };
  const list = first.parentElement;
  if (list === null) return { reason: "settings nav button has no parent element" };
  for (const button of buttons) {
    if (button.parentElement !== list) {
      return { reason: "settings nav buttons do not share one list container" };
    }
  }
  return { list };
}

/**
 * 解析选项。
 *
 * `previousPanel` 用节点身份把「Settings 已关闭」与「同一 panel 原地漂移」分开：
 * 旧节点已离线后再打开普通 modal 是 absent；旧节点仍连在文档却不再匹配才是 drift。
 * `sawShellBefore` 只为纯 parser 历史用例保留，运行时不使用它。
 */
export interface ResolveOptions {
  /** 上一次成功解析的具体 panel；用节点身份区分“关闭”与“原地漂移”。 */
  readonly previousPanel?: HTMLElement | undefined;
  /** 仅保留给源码级解析用例；运行时使用 `previousPanel` 而非永久布尔值。 */
  readonly sawShellBefore?: boolean;
}

type PanelCandidate =
  | { readonly kind: "ignore" }
  | { readonly kind: "invalid"; readonly reason: string }
  | { readonly kind: "ok"; readonly dom: SettingsShellDom };

/**
 * 官方 Settings panel 不只是“modal 里有 nav”：`aria-labelledby` 必须指向
 * nav 的直接标题节点，并且导航必须恰有一个当前项。这些都是官方
 * `SettingsRoot` 的 ARIA/DOM 契约，不依赖本地化文案或 CSS-module 哈希。
 */
function parsePanel(panel: HTMLElement): PanelCandidate {
  const nav = directNavChild(panel);
  if (nav === undefined) return { kind: "ignore" };

  const labelledBy = panel.getAttribute("aria-labelledby")?.trim();
  if (!labelledBy) return { kind: "ignore" };
  const title = Array.from(nav.querySelectorAll<HTMLElement>("[id]"))
    .find((node) => node.id === labelledBy);
  if (title === undefined || title.parentElement !== nav) return { kind: "ignore" };

  const { list, reason } = resolveNavList(nav);
  if (list === undefined) {
    return { kind: "invalid", reason: reason ?? "unknown nav-list drift" };
  }
  const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>("button"));
  const current = buttons.filter((button) => button.getAttribute("aria-current") === "true");
  if (current.length !== 1) {
    return {
      kind: "invalid",
      reason: `settings nav must contain exactly one aria-current button; found ${current.length}`,
    };
  }
  return { kind: "ok", dom: { panel, nav, navList: list, buttons } };
}

/**
 * 从文档解析设置 shell。
 * @param doc - 目标文档（注入以便测试）。
 * @param options - 解析选项（见 {@link ResolveOptions}）。
 */
export function resolveSettingsShell(
  doc: Document,
  options: ResolveOptions = {},
): SettingsShellResolution {
  const panels = Array.from(doc.querySelectorAll<HTMLElement>(PANEL_SELECTOR));

  const parsed = panels.map(parsePanel);
  const valid = parsed.filter(
    (candidate): candidate is Extract<PanelCandidate, { kind: "ok" }> => candidate.kind === "ok",
  );
  const invalid = parsed.find(
    (candidate): candidate is Extract<PanelCandidate, { kind: "invalid" }> =>
      candidate.kind === "invalid",
  );

  if (valid.length > 1) {
    return { kind: "drift", reason: `ambiguous settings panels: found ${valid.length}` };
  }
  const onlyValid = valid[0];
  if (onlyValid !== undefined && valid.length === 1 && invalid === undefined) {
    return { kind: "ok", dom: onlyValid.dom };
  }
  if (invalid !== undefined) return { kind: "drift", reason: invalid.reason };

  const previous = options.previousPanel;
  if (previous !== undefined && previous.isConnected) {
    const reason = directNavChild(previous) === undefined
      ? "settings panel lost its direct <nav> child"
      : "previous settings panel no longer matches its semantic contract";
    return { kind: "drift", reason };
  }

  // 有 dialog 但都没有直接子 nav。见过设置面板才算漂移，否则是「没打开」。
  if (panels.length > 0 && options.sawShellBefore === true) {
    return { kind: "drift", reason: "settings panel lost its direct <nav> child" };
  }
  return { kind: "absent" };
}

/** 诊断属性名：读不到就读 `documentElement.dataset.dshSettingsShell`。 */
export const SHELL_STATE_DATASET_KEY = "dshSettingsShell";

/** 分组标题节点的标记属性（值 = 组 id）。 */
export const GROUP_MARKER_ATTR = "data-dsh-ss-group";

/** 把解析状态记进 DOM，供人工与自动化核对（读不到就是没生效）。 */
export function recordShellState(doc: Document, state: string): void {
  doc.documentElement.dataset[SHELL_STATE_DATASET_KEY] = state;
}
