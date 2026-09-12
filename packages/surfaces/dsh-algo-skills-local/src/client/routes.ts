/**
 * Route literals this bundle talks to.
 *
 * Mirrored rather than imported: the host module owns `node:fs` and `node:http`
 * and must never enter a browser bundle. A test asserts the two sides are equal
 * (`tests/routes.spec.ts`), so the mirror cannot drift silently — which is the
 * only real risk of writing them twice.
 * @module dsh-algo-skills-local/client/routes
 */

/** Paths served by this plugin's host half. */
export const ROUTES = {
  tree: '/api/dsh-algo-skills/tree',
  toggle: '/api/dsh-algo-skills/toggle',
  health: '/api/dsh-algo-skills/health',
} as const
