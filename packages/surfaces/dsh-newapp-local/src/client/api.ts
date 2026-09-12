/**
 * The drawer's one reader: this plugin's own product scan.
 *
 * **One source, one protocol, one rule: never write.** The scan is a read of
 * `product.json` files that live in the products' own directories; this package
 * owns none of them, so there is nothing here to write back and no write path
 * at all — not even a disabled one.
 *
 * ## Why there is only one reader now
 *
 * The drawer used to compose three sources owned by two other plugins: the
 * agent roster (`dsh-role-matrix-local`) and the worktable's containers plus
 * their split layouts (`dsh-worktable`, one HTTP route and two localStorage
 * keys). That composition was the drawer's original idea of what an
 * "application" is, and it was the wrong shape — the roster is an organization
 * chart, not a list of things a person starts, and a container is a session
 * grouping, not a product.
 *
 * What the drawer lists now is what exists as a deliverable: a product declared
 * in its own directory. The roster is still read, but by the **launcher** and
 * for one question only — *is the preset this product declares installed here?*
 * — which is why no roster route literal appears in this module. The worktable
 * is not read at all, by anything here (ADR-0045).
 *
 * @module dsh-newapp-local/client/api
 */

import { parseScanPayload, type ScanResult } from './product-cards.ts'

/**
 * This plugin's own route for `product.json` discovery.
 *
 * The one place the browser half reads its *own* host half: the scan needs the
 * filesystem, which the browser half cannot touch. Everything the route returns
 * is a read of declarations that live in the products' own directories — the
 * launcher owns none of it (ADR-0028).
 */
export const PRODUCTS_ROUTE = '/api/dsh-newapp/products'

/** The product-scan reader. */
export class NewAppApi {
  /**
   * Read the product declaration scan.
   *
   * A non-2xx answer is *not* collapsed into "no products": a scan route that
   * answers 401 because the plugin is not loaded is a different fact from a
   * machine that declares no products, and only one of them is fixed by
   * authoring a `product.json`. The two get different reasons.
   * @returns the parsed scan, or why it could not be read.
   */
  async products(): Promise<ScanResult> {
    let response: Response
    try {
      response = await fetch(PRODUCTS_ROUTE, { headers: { accept: 'application/json' } })
    } catch (error) {
      return { ok: false, reason: `请求 ${PRODUCTS_ROUTE} 失败：${error instanceof Error ? error.message : String(error)}` }
    }
    if (!response.ok) {
      return {
        ok: false,
        reason: response.status === 401
          // Measured behaviour: an exact route registered by this plugin answers
          // without a cookie, so a 401 here means the host half is not loaded —
          // not that the request was unauthorized. Say the useful thing.
          ? `${PRODUCTS_ROUTE} 回答 401——插件宿主半边没有加载（重启后生效）。`
          : `${PRODUCTS_ROUTE} 回答 HTTP ${response.status}`,
      }
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch (error) {
      return { ok: false, reason: `响应不是 JSON：${error instanceof Error ? error.message : String(error)}` }
    }
    return parseScanPayload(payload)
  }
}
