/**
 * 设置 shell 语义锚的解析用例。
 *
 * 三态必须分开测：`ok` / `absent`（设置页没开，正常）/ `drift`（结构变了，要报）。
 * 把后两者混成「没找到」，就等于让结构漂移静默通过。
 */

import { describe, expect, it } from "vitest";

import { settingsShellFixture } from "../../test/fixtures/settings-shell.js";
import { GROUP_MARKER_ATTR, recordShellState, resolveSettingsShell } from "./anchors.js";

describe("resolveSettingsShell", () => {
  it("解析出 panel / nav / navList / 按钮，顺序与 DOM 一致", () => {
    const doc = settingsShellFixture({ sectionIds: ["general", "models", "plugins"] });
    const result = resolveSettingsShell(doc);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.dom.panel.getAttribute("role")).toBe("dialog");
    expect(result.dom.nav.tagName).toBe("NAV");
    expect(result.dom.buttons).toHaveLength(3);
    // navList 只装导航按钮：关闭按钮在 content 列里，不能被算进来
    expect(result.dom.navList.querySelectorAll("button")).toHaveLength(3);
    expect(result.dom.buttons.map((b) => b.textContent)).toEqual(["general", "models", "plugins"]);
  });

  it("设置页没打开时报 absent（正常状态，不是失败）", () => {
    const doc = document.implementation.createHTMLDocument("empty");
    expect(resolveSettingsShell(doc).kind).toBe("absent");
  });

  it("页面上有别的 dialog 时不误伤", () => {
    const doc = settingsShellFixture();
    const other = doc.createElement("div");
    other.setAttribute("role", "dialog");
    other.setAttribute("aria-modal", "true");
    other.textContent = "另一个对话框";
    doc.body.appendChild(other);
    // 仍然命中带 <nav> 的那个
    const result = resolveSettingsShell(doc);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.dom.panel.querySelector("nav")).not.toBeNull();
  });

  it("没见过设置面板时，无 nav 的 dialog 判为 absent（别的 modal 是正常的）", () => {
    const doc = settingsShellFixture({ broken: "no-nav" });
    expect(resolveSettingsShell(doc).kind).toBe("absent");
  });

  it("见过设置面板之后它丢了 nav → drift（不是 absent）", () => {
    const doc = settingsShellFixture({ broken: "no-nav" });
    const result = resolveSettingsShell(doc, { sawShellBefore: true });
    expect(result.kind).toBe("drift");
    if (result.kind !== "drift") return;
    expect(result.reason).toContain("lost its direct <nav>");
  });

  it("导航按钮不在同一父容器 → drift", () => {
    const doc = settingsShellFixture({ broken: "split-parents" });
    const result = resolveSettingsShell(doc);
    expect(result.kind).toBe("drift");
    if (result.kind !== "drift") return;
    expect(result.reason).toContain("share one list container");
  });

  it("导航里一个按钮都没有 → drift", () => {
    const doc = settingsShellFixture({ sectionIds: [] });
    expect(resolveSettingsShell(doc).kind).toBe("drift");
  });

  it("结构相似但没有官方 title 链接的 direct-nav dialog 不会被当成 Settings", () => {
    const doc = settingsShellFixture({ sectionIds: ["general", "models", "plugins"] });
    const decoy = doc.createElement("aside");
    decoy.setAttribute("role", "dialog");
    decoy.setAttribute("aria-modal", "true");
    const nav = doc.createElement("nav");
    const list = doc.createElement("div");
    const button = doc.createElement("button");
    button.setAttribute("aria-current", "true");
    list.appendChild(button);
    nav.appendChild(list);
    decoy.appendChild(nav);
    doc.body.prepend(decoy);

    const result = resolveSettingsShell(doc);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.dom.panel).not.toBe(decoy);
  });

  it("没有唯一 aria-current 的 direct-nav dialog 不是可接受的 Settings 面板", () => {
    for (const broken of ["no-current", "duplicate-current"] as const) {
      const doc = settingsShellFixture({
        sectionIds: ["general", "models", "plugins"],
        broken,
      });
      expect(resolveSettingsShell(doc).kind).not.toBe("ok");
    }
  });

  it("两个完整 Settings 形状同时出现时 fail closed，不选第一个", () => {
    const doc = settingsShellFixture({ sectionIds: ["general", "models", "plugins"] });
    const secondDoc = settingsShellFixture({ sectionIds: ["general", "models", "plugins"] });
    const secondOverlay = secondDoc.body.firstElementChild;
    expect(secondOverlay).not.toBeNull();
    doc.body.appendChild(doc.importNode(secondOverlay!, true));

    const result = resolveSettingsShell(doc);
    expect(result.kind).toBe("drift");
    if (result.kind !== "drift") return;
    expect(result.reason).toContain("ambiguous");
  });
});

describe("recordShellState", () => {
  it("状态写进 documentElement.dataset，可被外部读到", () => {
    const doc = document.implementation.createHTMLDocument("state");
    recordShellState(doc, "grouped:5");
    expect(doc.documentElement.dataset.dshSettingsShell).toBe("grouped:5");
  });
});

describe("GROUP_MARKER_ATTR", () => {
  it("标记属性名稳定（外部诊断与测试都依赖它）", () => {
    expect(GROUP_MARKER_ATTR).toBe("data-dsh-ss-group");
  });
});
