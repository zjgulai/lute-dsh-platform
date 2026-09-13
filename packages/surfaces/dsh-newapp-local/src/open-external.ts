/**
 * Handing one address to the operating system's default browser.
 *
 * ## Why this module exists at all
 *
 * The obvious implementation — `<a href="https://…" target="_blank">` — **does
 * nothing in this shell.** Measured in the shipped runtime
 * (`lib/electron-runtime-*.js`, the `setWindowOpenHandler` this app installs):
 *
 *     window.webContents.setWindowOpenHandler(({ url }) => {
 *       // P0-6v2: openExternal 白名单化——仅 mailto；http/https 一律拒绝
 *       … shell.openExternal(target.href) only for mailto:
 *       return { action: "deny" }
 *     })
 *
 * So an anchor would render as a live link, accept the click, and silently do
 * nothing — the exact failure shape this drawer is built to avoid. A card whose
 * button lies is worse than a card with no button.
 *
 * ## Why not the official opener
 *
 * `@deepseek-ai/dsh-native-command` ships `openNativePath`, and
 * `session.openWorkspacePath` exposes an "open on the host desktop" command.
 * Neither fits: the first takes a *filesystem path* and its cross-platform
 * branches (PowerShell `Invoke-Item`, `wslpath` translation) are wrong for a
 * URL; the second resolves its argument as a session workspace path before
 * opening it, which rewrites what a URL means. Both are path openers being asked
 * to do a job they were not designed for, so this module states the three
 * platform commands it actually needs, and nothing more.
 *
 * ## The shape of the guarantee
 *
 * The command is built from a **validated** address and passed as an argv
 * element — never through a shell — so there is no string for a hostile address
 * to escape into. `runNativeCommand` is injectable so the argv for all three
 * platforms is asserted in tests without spawning anything.
 *
 * @module dsh-newapp-local/open-external
 */
import { execFile } from 'node:child_process'

/** Runs one executable with an argv array. Injectable: tests assert, never spawn. */
export type NativeRunner = (command: string, args: readonly string[]) => Promise<void>

/** The platform family whose opener this module knows. */
export type OpenPlatform = 'darwin' | 'win32' | 'linux'

/**
 * Run one executable, no shell, no interpolation.
 * @param command - executable name or path.
 * @param args - argv, never a shell string.
 * @returns a promise that rejects with the child's own error.
 */
export const runNativeCommand: NativeRunner = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, [...args], { encoding: 'utf8', windowsHide: true }, (error) => {
      if (error === null) {
        resolve()
        return
      }
      reject(error)
    })
  })

/**
 * The command that opens one address in the platform's default browser.
 *
 * `open` (macOS) and `xdg-open` (Linux) are the platform's own delegation to the
 * user's chosen handler. Windows has no such executable on PATH; the shell-free
 * equivalent is `rundll32 url.dll,FileProtocolHandler`, which is what
 * `start` resolves to without the `cmd /c` wrapper that would reintroduce a
 * command line for an address to escape into.
 * @param href - a validated https address.
 * @param platform - the host platform.
 * @returns the executable and its argv.
 */
export function openerCommand(href: string, platform: OpenPlatform): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [href] }
  if (platform === 'win32') return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', href] }
  return { command: 'xdg-open', args: [href] }
}

/** Whether the string is an https address on the LUTE portal. */
function isOpenable(href: string): boolean {
  if (!href.startsWith('https://')) return false
  try {
    const url = new URL(href)
    return url.protocol === 'https:' && url.hostname.endsWith('.lute-tlz-dddd.top')
  } catch {
    return false
  }
}

/**
 * Open one address with the operating system's default browser.
 *
 * Refuses anything that is not an https address on the portal domain. The check
 * is redundant with the catalog's own assertions on purpose: this is the last
 * gate before an address becomes an OS-level launch, and one `startsWith` is a
 * cheap price for not depending on every upstream path having been careful.
 * @param href - the address to open.
 * @param options - platform and runner seams.
 * @returns nothing on success.
 * @throws when the address is not openable, or the opener fails.
 */
export async function openExternalUrl(
  href: string,
  options: { platform?: OpenPlatform; run?: NativeRunner } = {},
): Promise<void> {
  if (!isOpenable(href)) {
    throw new Error(`refusing to open a non-portal address: ${href}`)
  }
  const platform = options.platform ?? (process.platform as OpenPlatform)
  const run = options.run ?? runNativeCommand
  const { command, args } = openerCommand(href, platform)
  await run(command, args)
}
