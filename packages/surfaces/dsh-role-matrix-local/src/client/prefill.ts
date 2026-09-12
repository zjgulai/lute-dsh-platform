/**
 * Composer prefill — put a prompt into the current session's draft, and nothing
 * else. Clicking a capability card must leave the user in control of sending
 * (R7), so this never calls `send`.
 *
 * ## The channel, and why it is reached this way
 *
 * The shipped conversation plugin publishes a per-session **provide-channel
 * action face** — `actions.setDraft(text)` — which is what the composer itself
 * binds to; writing through it means the editor's own state, undo history and
 * caret placement all move exactly as they do for typed input. Reaching it:
 *
 *   `conversation` (service) → `.input` (the session-input hub) → `.shell(id)`
 *
 * The documented face of that hub is `for(ctx)` — *"resolve the facade for one
 * session-scope ctx"* — and a DOM-mounted row has no session-scope ctx to hand
 * it, so `shell(id)` is used directly. That is one step inside the documented
 * surface: `for()` is implemented as `shell(this.sessions().scopeOf(actx))`, so
 * the method and its session-id argument are structurally required, but they are
 * not advertised. This is therefore a **read of a shape that can move**, and it
 * is treated as one:
 *
 *  - every level is probed (`typeof … === 'function'`) rather than assumed;
 *  - a missing channel is reported with the reason, never swallowed;
 *  - nothing throws into the shell's stack.
 *
 * There is deliberately **no DOM fallback**. The composer is a Lexical
 * contenteditable whose text is owned by the editor instance; poking
 * `textContent` would leave the editor's model disagreeing with the pixels, and
 * the user would discover it by sending a message that does not contain what
 * they can see. Reporting "prefill unavailable" is the honest degradation.
 *
 * @module dsh-role-matrix-local/client/prefill
 */

/** What the prefill can do. */
export type PrefillOutcome = { ok: true } | { ok: false; reason: string }

/** `conversation.input.shell(id)` result, narrowed to what is needed. */
interface SessionInputLike {
  actions?: { setDraft?: (text: string) => void }
}

/** The `conversation` service, narrowed to what is needed. */
interface ConversationLike {
  input?: { shell?: (sessionId: string) => SessionInputLike | undefined }
}

/**
 * Write `text` into a session's draft.
 * @param conversation - the `conversation` service (read through a lookup).
 * @param sessionId - the session whose draft is being filled.
 * @param text - the prompt to place in the composer.
 * @returns whether the draft was written, and why not when it was not.
 */
export function prefillDraft(conversation: unknown, sessionId: string, text: string): PrefillOutcome {
  if (sessionId === '') return { ok: false, reason: '没有当前会话 id' }
  if (text === '') return { ok: false, reason: '没有可预填的文本' }

  const service = conversation as ConversationLike | undefined
  const shell = service?.input?.shell
  if (typeof shell !== 'function') {
    return { ok: false, reason: 'conversation.input.shell 不可用（官方会话插件的输入面已变）' }
  }

  let facade: SessionInputLike | undefined
  try {
    facade = shell.call(service?.input, sessionId)
  } catch (error) {
    return { ok: false, reason: `conversation.input.shell 抛出：${error instanceof Error ? error.message : String(error)}` }
  }
  const setDraft = facade?.actions?.setDraft
  if (typeof setDraft !== 'function') {
    return { ok: false, reason: '该会话没有 actions.setDraft（草稿通道未挂载）' }
  }
  try {
    setDraft.call(facade?.actions, text)
  } catch (error) {
    return { ok: false, reason: `setDraft 抛出：${error instanceof Error ? error.message : String(error)}` }
  }
  return { ok: true }
}

/**
 * The sentence a capability card prefills.
 *
 * It names both levels the surface shows — the platform skill that will run and
 * the material business skill it serves — so the user can see the click did what
 * the card said it would, and can finish the sentence with their own subject.
 * @param skillLabel - the platform skill's display name.
 * @param groupName - the material business-skill name the card sits under.
 * @returns the prompt text.
 */
export function prefillPrompt(skillLabel: string, groupName: string): string {
  return `请用「${skillLabel}」完成「${groupName}」任务：`
}
