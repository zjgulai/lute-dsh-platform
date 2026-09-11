/** Package-owned invariant companion for the bridge browser. */
import type { Context } from '@deepseek-ai/cordis';
/** Companion name. */
export declare const name = "bridge-browser-invariant";
/** Required registry. */
export declare const inject: string[];
/** Reserve this package's invariant ownership. */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map