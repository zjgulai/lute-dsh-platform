/**
 * New App drawer mounting (browser half).
 *
 * The drawer is rendered with its own React root appended to document.body (the
 * sidebar shell exposes no slot an external plugin can register into). Opening
 * mounts the tree; closing unmounts and removes the container. The injected
 * sidebar row toggles it through the returned controller.
 */
import { createRoot, type Root } from 'react-dom/client'
import type { NewAppApi } from './api.ts'
import type { AppLauncher } from './launcher.ts'
import { NewAppPanel } from './NewAppPanel.tsx'

/** Mounted drawer controller: toggle/open/close plus the disposer. */
export interface NewAppMount {
  toggle: () => void
  open: () => void
  close: () => void
  isOpen: () => boolean
  subscribe(listener: () => void): () => void
  dispose: () => void
}

/**
 * Mount the New App overlay drawer.
 * @param api - the read-only source reader.
 * @param launcher - the two actions a card can take.
 * @returns controller (toggle/open/close/subscribe) and the disposer.
 */
export function mountPanel(api: NewAppApi, launcher: AppLauncher): NewAppMount {
  let root: Root | undefined
  let container: HTMLDivElement | undefined
  const listeners = new Set<() => void>()

  const notify = (): void => { for (const listener of [...listeners]) listener() }

  const close = (): void => {
    if (root === undefined) return
    root.unmount()
    root = undefined
    container?.remove()
    container = undefined
    notify()
  }

  const open = (): void => {
    if (root !== undefined) return
    container = document.createElement('div')
    // Root class + L2 semantic attributes: this overlay is its own CSS surface,
    // so the plugin root class has to travel with the mount node.
    container.className = 'dsh-newapp-root'
    container.dataset.dshPlugin = 'newapp-local'
    container.dataset.dshPart = 'panel'
    document.body.appendChild(container)
    root = createRoot(container)
    root.render(<NewAppPanel api={api} launcher={launcher} onClose={close} />)
    notify()
  }

  const toggle = (): void => {
    if (root !== undefined) close()
    else open()
  }

  return {
    toggle,
    open,
    close,
    isOpen: () => root !== undefined,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose: () => {
      close()
      listeners.clear()
    },
  }
}
