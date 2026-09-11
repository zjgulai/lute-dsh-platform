/**
 * Standalone tsdown config for the role-matrix plugin.
 *
 * Uses the repo's shared client-bundle preset (shared/tsdown.client.ts):
 * node-half lib/ (preset scan + route) plus the browser bundle lib/client.js
 * (closure-factory artifact for the GUI's __ModuleLoader__, CSS Modules
 * inlined with auto-injected <style data-plugin>). The client entry is
 * auto-detected at src/client/index.ts by the preset.
 */
import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle('dsh-role-matrix-local', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-host-webserver',
  ],
})
