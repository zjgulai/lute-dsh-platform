/**
 * 反向守卫：**任何被钉住的官方 CSS-module 哈希类名都不允许出现在产品代码里**。
 *
 * 为什么要有这一支：本轮故障的结构性原因就是这个文件原先的断言
 * `expect(BRAND_CSS).toContain("._37cUPa_headlineText, ._37cUPa_previewBadge …")`
 * —— 把版本钉复制进断言等于自证，上游换哈希后它照样绿。这里改成「来源里不得出现
 * 哈希选择器」，并把「真机命中」交给真实产物 seam 的测试去证。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BRAND_CSS, BRAND_CSS_STYLE_ID } from "./brand.js";

const clientDir = import.meta.dirname;

/** 产品代码里不允许出现的哈希选择器规则（`.<prefix>_<local> {`）。 */
const HASHED_SELECTOR = /\.[A-Za-z0-9_]*_[A-Za-z][A-Za-z0-9_]*\s*\{/g;

const SOURCE_FILES = ["brand.tsx", "index.tsx", "live-selectors.ts", "official-text.ts"];

describe("brand CSS 不再钉住官方哈希", () => {
  it("src/client 下没有写死的哈希选择器规则", () => {
    const offenders: string[] = [];
    for (const name of SOURCE_FILES) {
      const source = readFileSync(resolve(clientDir, name), "utf8");
      for (const match of source.match(HASHED_SELECTOR) ?? []) {
        offenders.push(`${name}: ${match.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("构建产物里也不再出现上一代的哈希前缀", () => {
    const bundle = readFileSync(resolve(clientDir, "../../lib/client.js"), "utf8");
    expect(bundle).not.toContain("_37cUPa");
    expect(bundle).not.toContain("q2FAPq");
  });

  it("保留可发布安装所需的稳定样式标签 id", () => {
    expect(BRAND_CSS_STYLE_ID).toBe("dsh-root-brand-css");
    expect(BRAND_CSS).toContain('data-plugin="dsh-root-brand"');
  });
});
