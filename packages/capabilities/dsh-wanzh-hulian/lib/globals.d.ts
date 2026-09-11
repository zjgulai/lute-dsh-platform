/**
 * dsh-wanzh-hulian — 客户端 bundle 的宿主契约声明。
 *
 * DSH 客户端 bundle 不使用 ES import：宿主 ModuleLoader 在模块求值期调用
 * `window.__ModuleLoader__.load({ id, factory })`，factory 收到一个 `require`，
 * 本 bundle 只从中取 `react`。此处声明这两条宿主契约，使 `checkJs` 下的
 * bundle 通过类型检查（与 dsh-ui-polish-local 的 globals.d.ts 同型）。
 */

/** React 只按用到的 API 声明：本 bundle 仅用 createElement / useState / useEffect。 */
type WanzhReact = {
  createElement: typeof import('react').createElement;
  useState: typeof import('react').useState;
  useEffect: typeof import('react').useEffect;
};

interface DshModuleRequire {
  (id: 'react'): WanzhReact;
  (id: string): unknown;
}

interface DshModuleLoaderEntry {
  id: string;
  factory: (require: DshModuleRequire) => unknown;
}

interface Window {
  __ModuleLoader__: { load(entry: DshModuleLoaderEntry): void };
}
