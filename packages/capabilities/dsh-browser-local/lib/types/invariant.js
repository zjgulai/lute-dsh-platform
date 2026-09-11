/** Package-owned invariant companion for the bridge browser. */
import { HELLO_TIMEOUT_MS } from './protocol.js';
import { isLoopbackAddress } from './server.js';
/** Standalone fail used when the companion is invoked without harness wiring. */
function plainFail(message) {
    throw new Error(`invariant violated by "@yuxianglin/dsh-bridge-browser": ${message}`);
}
/**
 * Runtime invariants the bridge guards across releases:
 * - unauthenticated hello within HELLO_TIMEOUT_MS or the socket closes;
 * - loopback classification only accepts real loopback addresses;
 * - privileged gateway dispatch is restricted to loopback peers (server.ts,
 *   PRIVILEGED_METHODS + remote address check).
 */
const install = (_ctx, fail = plainFail) => {
    if (!(HELLO_TIMEOUT_MS > 0))
        fail('hello authentication timeout must be positive');
    if (!isLoopbackAddress('127.0.0.1'))
        fail('loopback classifier must accept 127.0.0.1');
    if (!isLoopbackAddress('::ffff:127.0.0.1'))
        fail('loopback classifier must accept IPv4-mapped loopback');
    if (isLoopbackAddress('8.8.8.8'))
        fail('loopback classifier must reject public addresses');
    if (isLoopbackAddress(undefined))
        fail('loopback classifier must treat missing address as non-loopback');
};
/** Companion name. */
export const name = 'bridge-browser-invariant';
/** Required registry. */
export const inject = ['invariants'];
/** Reserve this package's invariant ownership. */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@yuxianglin/dsh-bridge-browser', install));
//# sourceMappingURL=invariant.js.map