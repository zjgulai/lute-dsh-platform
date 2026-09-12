/**
 * Standalone tsdown config for the algorithm-skills surface.
 *
 * Uses the repo's shared client-bundle preset (build/tsdown.client.ts):
 * a node-half lib/ (the /api/dsh-algo-skills route family) plus the browser
 * bundle lib/client.js (a closure-factory artifact for the GUI's
 * __ModuleLoader__, CSS Modules inlined with the auto-injected
 * <style data-plugin> tag). The client entry is auto-detected at
 * src/client/index.ts by the preset.
 */
import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle('dsh-algo-skills-local', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-host-webserver',
  ],
})
