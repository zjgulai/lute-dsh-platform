/**
 * 在导入客户端 bundle 之前安装 ModuleLoader 桩。
 * 该 bundle 在**模块求值时**就调用 `window.__ModuleLoader__.load(...)`，
 * 因此桩必须在 setup 阶段（早于任何 import）就位。
 */
type Factory = (require: unknown) => unknown

interface Entry { id: string; factory: Factory }

const captured: Entry[] = []
;(globalThis as unknown as { window: Record<string, unknown> }).window.__ModuleLoader__ = {
  load: (entry: Entry) => { captured.push(entry) },
  /** 测试读取入口用。 */
  __captured: captured,
}

export function loaderEntries(): Entry[] {
  return captured
}
