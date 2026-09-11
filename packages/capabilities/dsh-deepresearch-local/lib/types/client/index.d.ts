/** Client mount for the deep-research Remote contribution. */
import type { TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol';
export type {} from '@deepseek-ai/dsh-deepresearch/remote';
interface DeepResearchClientContext {
    remote: TypertClientRemote;
    locale: {
        register(ns: string, dictionaries: {
            zh: Record<string, string>;
            en: Record<string, string>;
        }): () => void;
    };
    effect(callback: () => unknown, label?: string): unknown;
    inject(services: readonly string[], callback: (scoped: DeepResearchScopedServices) => unknown): {
        dispose(): Promise<void>;
    };
}
/** ctx.inject([...]) 返回的受限上下文：注入的服务被提升到顶层。 */
interface DeepResearchScopedServices {
    remote: TypertClientRemote;
    slots: {
        inject(path: string, callback: () => unknown): unknown;
        register(entry: Record<string, unknown>, component: unknown): () => void;
    };
}
/** Required services: the typed Remote client, slot registry, and locale service. */
export declare const inject: string[];
/**
 * Mount the deep-research Remote namespace and its global sidebar/overlay surfaces.
 * @param ctx - Web client root carrying Remote, slot, and locale services.
 * @returns disposer after the namespace is ready.
 */
export declare function apply(ctx: DeepResearchClientContext): Promise<() => Promise<void>>;
//# sourceMappingURL=index.d.ts.map