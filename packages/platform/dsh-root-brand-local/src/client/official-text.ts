/**
 * 官方 hero 预览角标的文案改写。
 *
 * 为什么必须走 DOM 而不是官方 API：`hero.preview` 是 conversation 包**私有** locale
 * 命名空间的键（`ctx.locale.register` 对同命名空间同 locale 直接抛错），也不是公开
 * slot。因此这里保持官方节点不动、只改写它的文本，外观/位置/无障碍语义全部保留。
 *
 * 语言无关：中英界面都显示 `Preview`。
 */

/** 官方 zh 词典里的角标原文。 */
export const OFFICIAL_PREVIEW_TEXT = "预览版";
/** 目标文案。 */
export const PREVIEW_TEXT = "Preview";

/** 把文本节点写进元素，并尽量复用 React 已挂的第一个文本节点（避免打断它的引用）。 */
function writeText(node: HTMLElement, text: string): void {
  const first = node.firstChild;
  if (first !== null && first.nodeType === 3) {
    if ((first as Text).data !== text) (first as Text).data = text;
    // 清掉可能存在的后续兄弟文本节点（同一元素里不该有第二段文案）
    for (const extra of [...node.childNodes]) {
      if (extra !== first && extra.nodeType === 3) extra.remove();
    }
    return;
  }
  node.textContent = text;
}

/** 单次改写：仅当文本仍是官方原文时替换。 */
function applyOnce(node: HTMLElement): void {
  if (node.textContent === OFFICIAL_PREVIEW_TEXT) writeText(node, PREVIEW_TEXT);
}

/**
 * 观察官方角标并保持目标文案；返回 disposer（会断开观察并还原原文）。
 *
 * 观测该元素自身的 childList 与 characterData：React 重渲染写回原文、
 * 或语言切换触发重渲染时，都会在此重新改写。
 */
export function observePreviewText(node: HTMLElement): () => void {
  applyOnce(node);

  const observer = new MutationObserver(() => applyOnce(node));
  observer.observe(node, { childList: true, characterData: true, subtree: true });

  return () => {
    observer.disconnect();
    if (node.textContent === PREVIEW_TEXT) writeText(node, OFFICIAL_PREVIEW_TEXT);
  };
}
