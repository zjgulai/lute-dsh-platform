/**
 * 上游 0.1.2-rc.1 的 `.d.ts` 比**运行时少成员**——运行时有、声明里没有。
 *
 * 这是上游 DSH 的类型完整性缺陷（本仓库无法在上游修复），因此在本包的**消费侧**
 * 以显式的模块增强补齐，而不是在源码里散落 `as any` 或复制一份本地声明。
 * 三条事实与 `scripts/gates/dsh-types.mjs` 的 `augmentDeclarations()` 完全相同：
 * 那份作用于生成目录 `.dsh-types/`，这份作用于从内建运行时 tgz 直接装进
 * `node_modules` 的类型（ADR-0017 的两种消费方式），上游修复后两处一起删。
 *
 * 为什么不能只写 `interface`：模块增强里必须显式 `export`，否则声明不会并进目标模块。
 * 为什么 `SessionHeader` 要单独走一个 specifier：它在 `lib/types/types.d.ts` 里声明，
 * 主入口只是 `import type` 进来使用、并未重导出，而模块增强只能并进**声明它的那个模块**。
 * 该 specifier 由 tsconfig 的 `paths` 映射到那个声明文件，不是运行时导入。
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'

declare module '@deepseek-ai/dsh-session' {
  /**
   * 运行时实例拥有 `events` 数组（实测 `lib/index.js` 的 `this.events` 3 处），
   * 发布声明未暴露。
   */
  export interface Session {
    readonly events: readonly SessionEvent[]
  }

  /** 运行时从 `dsh-util-values` 使用 `JsonValue`（实测 5 处），主入口未重导出。 */
  export type { JsonValue } from '@deepseek-ai/dsh-util-values'
}

declare module '@deepseek-ai/dsh-session/internal-types' {
  /** 运行时 `session.header.seedLength` 存在（实测 `lib/index.js` 2 处），声明缺失。 */
  export interface SessionHeader {
    readonly seedLength?: number
  }
}
