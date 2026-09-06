/**
 * llm_adapter.ts —— 白箱 LLM 服务商（WhiteboxLlmAdapter）
 *
 * 设计哲学：白箱本身就是 LLM 模型（对外完全对齐 dsh-llm 协议），内部白箱化。
 *  - provider: 'lingshu-whitebox'（设置页「模型」可见，可被 agent 默认选用）
 *  - stream(): 调灵枢 wisdom_chat（白箱 CCG 条件路由/组合生成/自校验）
 *  - token 计数：输入/输出/缓存命中（白箱直答 = 全部 cacheRead，零推理成本）
 *  - 降级：白箱无把握（route=llm / 桥未就绪）→ 可选 fallback（后续接 deepseek）
 *
 * 结构仿官方 @deepseek-ai/dsh-llm-deepseek adapter。
 */
// ---- token 估算（确定性启发式：CJK 0.6/字符，其余 /4）----
export function estimateTokens(text) {
    if (!text)
        return 0;
    let cjk = 0;
    let other = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0);
        if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x30ff))
            cjk++;
        else
            other++;
    }
    return Math.ceil(cjk * 0.6 + other / 4);
}
/** 从 GenerateOptions 汇总输入 token（system + messages 全部文本）。 */
export function countInputTokens(options) {
    let total = 0;
    if (options.system)
        total += estimateTokens(options.system);
    for (const msg of options.messages ?? []) {
        for (const block of msg.content ?? []) {
            if (typeof block?.text === 'string')
                total += estimateTokens(block.text);
            if (typeof block?.arguments === 'string')
                total += estimateTokens(block.arguments);
        }
    }
    return total;
}
/** 把 DSH 会话消息折叠成白箱可读的对话文本。 */
export function serializeMessages(options) {
    const parts = [];
    if (options.system)
        parts.push(`[系统] ${options.system}`);
    for (const msg of options.messages ?? []) {
        const text = (msg.content ?? [])
            .filter((b) => b?.type === 'text' && typeof b.text === 'string')
            .map((b) => b.text)
            .join('');
        if (!text)
            continue;
        const role = msg.role === 'assistant' ? '灵枢' : msg.role === 'user' ? '用户' : msg.role;
        parts.push(`[${role}] ${text}`);
    }
    return parts.join('\n');
}
/** 把一段完整文本包装成协议流（确定性整段生成 → 单次流）。 */
export async function* wrapTextStream(text, inputTokens, outputTokens, cacheReadTokens) {
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    yield {
        type: 'usage',
        usage: {
            inputTokens,
            outputTokens,
            ...(cacheReadTokens > 0 ? { cacheReadTokens } : {}),
        },
    };
    yield { type: 'finish', reason: 'stop' };
}
/**
 * 白箱知识卡片格式检测：REVERSE_DAILY 直答是知识库内部格式——
 * 「X是什么…，是『A』vs『B』的矛盾——X（是…（…（…）…）…真相：①…」
 * 特征（任一强信号命中即判定）：
 * ① 卡片开头句式：内容含「，是『X』vs『Y』的矛盾——」（矛盾标记+破折号）
 * ② 「真相：」结构化标记（卡片分段标题）+ 括号密集（>8）
 * ③ 长文本（>300）+ 高括号密度（>20）+ 无自然语言标点分隔（顿号密集）
 */
export function isCardFormat(text) {
    if (!text)
        return false;
    // ① 强信号：矛盾标记句式（「，是『A』vs『B』的矛盾——」）——卡片开头的
    //    标志性结构，不受长度门槛限制（短卡片也判定）
    if (/，是『[^』]{1,12}』vs『[^』]{1,12}』的矛盾[——\-]/.test(text))
        return true;
    // 短文本（<150）无矛盾标记 → 正常文本
    if (text.length < 150)
        return false;
    // ② 「真相：」+ 括号密集（卡片的分段结构）
    if (text.includes('真相：')) {
        const parens = (text.match(/（/g) ?? []).length;
        if (parens >= 8)
            return true;
    }
    // ③ 超长 + 极高括号密度（卡片展开体）
    const parens2 = (text.match(/（/g) ?? []).length;
    if (text.length > 300 && parens2 > 20)
        return true;
    return false;
}
/** 白箱 LLM adapter —— 注册为 DSH 的 provider。 */
export class WhiteboxLlmAdapter {
    bridge;
    fallback;
    constructor(deps = {}) {
        this.bridge = deps.bridge;
        this.fallback = deps.fallback;
    }
    providerInfo(provider) {
        return { id: provider, name: '白箱灵枢 (lingshu-whitebox)' };
    }
    providerRetryPolicy() {
        return undefined;
    }
    async listModels() {
        return [
            { provider: 'lingshu-whitebox', id: 'whitebox-v1', name: '白箱引擎 v1 (CCG 条件路由)' },
            { provider: 'lingshu-whitebox', id: 'whitebox-wisdom', name: '白箱智慧之书' },
        ];
    }
    async resolveModel(provider, model) {
        return { provider, id: model, name: model };
    }
    /**
     * 核心：一次模型调用。白箱优先，无把握降级。
     * @param options 完全装配的请求（必须 honor options.signal）
     */
    async *stream(options) {
        const inputTokens = countInputTokens(options);
        const conversation = serializeMessages(options);
        // 取最后一条用户文本作为白箱输入（完整对话太长时截尾）
        const lastUserText = [...(options.messages ?? [])]
            .reverse()
            .flatMap((m) => m.content ?? [])
            .filter((b) => b?.type === 'text')
            .map((b) => b.text)
            .join('')
            .slice(-2000);
        // ---- 白箱主路径：调灵枢 wisdom_chat ----
        let whitebox = null;
        if (this.bridge?.isReady?.()) {
            try {
                const r = await this.bridge.callTool('wisdom_chat', {
                    message: lastUserText || conversation.slice(-4000),
                    session_id: options.sessionId ?? 'default',
                }, options.signal);
                const raw = (r?.content ?? []).map((c) => c.text ?? '').join('\n');
                // 白箱返回结构：{"reply": "...", "route": "self|llm", "hits": [...], "honest": bool}
                let text = raw;
                let route = 'self';
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed.route)
                        route = parsed.route;
                    if (typeof parsed.reply === 'string')
                        text = parsed.reply;
                    else if (parsed.reply !== undefined)
                        text = JSON.stringify(parsed.reply);
                }
                catch { /* 非 JSON = 纯文本回复 */ }
                // 质量门槛（v0.4.1）：REVERSE_DAILY 卡片直答是知识库内部格式——
                // 「X是什么…是『A』vs『B』的矛盾——X（是…（…）」重复+括号嵌套，
                // 直接当 LLM 输出喂给用户=「重复回答」。检测到卡片特征 → 视为
                // 未命中，走降级 LLM（白箱不输出内部格式垃圾）。
                if (route !== 'llm' && text && text.trim() && !isCardFormat(text)) {
                    whitebox = { text: text.trim(), route };
                }
                else if (text && isCardFormat(text)) {
                    console.warn('[whitebox-llm] 白箱返回知识卡片格式，降级 LLM（内部格式不直出）');
                }
            }
            catch (err) {
                // 白箱异常不阻塞——记日志后走降级
                console.warn('[whitebox-llm] 白箱调用失败，降级:', String(err));
            }
        }
        if (whitebox) {
            const outputTokens = estimateTokens(whitebox.text);
            // 白箱直答 = 全缓存命中（条件路由固化命中，零推理成本）
            yield* wrapTextStream(whitebox.text, inputTokens, outputTokens, inputTokens);
            return;
        }
        // ---- 降级路径：白箱无把握 / 桥未就绪 ----
        if (this.fallback) {
            console.warn('[whitebox-llm] 白箱未命中，转降级 LLM');
            yield* this.fallback.stream(options);
            return;
        }
        // 无降级可用：诚实声明（盲区 28：未来承诺不可检验——不假装回答）
        const honest = '（白箱引擎未命中且降级 LLM 未配置——按白箱纪律，我诚实声明不知道，不编造答案。）';
        yield* wrapTextStream(honest, inputTokens, estimateTokens(honest), 0);
    }
}
/** provider 路由名（设置页「模型」下拉可见）。 */
export const WHITEBOX_PROVIDER = 'lingshu-whitebox';
/**
 * 注册白箱 provider 到 DSH llm 服务（动态检测，不强依赖 llm 服务——
 * 最小 host 无 llm 时跳过，插件其余功能不受影响）。
 * @returns 注销函数；未注册返回 noop。
 */
export function installWhiteboxLlm(ctx, bridge) {
    // 动态检测 llm 服务（P1 模式：timer/webServer 同理）。
    // 注意：不能直接读 ctx.llm——Cordis 未声明 inject 的属性访问会抛
    // "cannot get property without inject"；ctx.get('llm') 安全返回 undefined。
    const llm = ctx.get('llm');
    if (!llm?.registerAdapter) {
        ctx.logger?.info?.('dsh-memory: llm 服务不可用，跳过白箱 provider 注册（最小 host）');
        return () => { };
    }
    // 降级 LLM：白箱未命中时转发给 fallbackProvider 路由（默认 deepseek-official，
    // 可在 settings.yaml 的 llm-whitebox.fallbackProvider 覆盖）。通过 llm.stream
    // 重路由——保持 DSH 的全链路（重试/瀑布流/用量计量）。
    const fallbackProvider = 'deepseek-official';
    const fallback = llm.stream
        ? {
            stream(options) {
                return llm.stream({ ...options, provider: fallbackProvider });
            },
        }
        : undefined;
    const adapter = new WhiteboxLlmAdapter({ bridge, fallback });
    try {
        llm.registerConfigurableProviders?.([{
                provider: WHITEBOX_PROVIDER,
                displayName: '白箱灵枢 (Whitebox)',
                settingsNs: 'llm-whitebox',
                settingsPath: [],
            }]);
        const registration = llm.registerAdapter([WHITEBOX_PROVIDER], adapter);
        ctx.logger?.info?.('dsh-memory: 白箱 LLM provider 已注册: %s（降级→%s）', WHITEBOX_PROVIDER, fallbackProvider);
        return () => { try {
            registration?.replace?.([]);
        }
        catch { /* 忽略注销异常 */ } };
    }
    catch (err) {
        ctx.logger?.warn?.('dsh-memory: 白箱 provider 注册失败: %s', String(err));
        return () => { };
    }
}
