/**
 * DSH 客户端 bundle 由宿主 ModuleLoader 加载：入口在模块求值期调用
 * `window.__ModuleLoader__.load({ id, factory })`。此处声明该全局契约，
 * 使 `checkJs` 下的 bundle 通过类型检查。
 */
interface DshModuleLoaderEntry {
  id: string;
  factory: (require: unknown) => unknown;
}

interface Window {
  __ModuleLoader__: { load(entry: DshModuleLoaderEntry): void };
}
