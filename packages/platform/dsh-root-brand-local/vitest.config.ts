import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    // 两支都要在：真实产物 seam（test/）与源码级守卫（src/）。
    // 只写前者会让既有的 src 测试静默不执行 —— 那正是本轮故障的同款盲区。
    include: ['test/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
  },
})
