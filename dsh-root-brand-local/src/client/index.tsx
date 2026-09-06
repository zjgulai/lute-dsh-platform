import { jsx } from "react/jsx-runtime";
import { HeroRootBrand, RootMark, SidebarRootName, installBrandCss } from "./brand.js";

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

  ctx.effect(installBrandCss, "dsh-root-brand: brand css");
}

export { HeroRootBrand, RootMark, SidebarRootName };
