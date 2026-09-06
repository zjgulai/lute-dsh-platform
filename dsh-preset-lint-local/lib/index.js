import { watch, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export const name = "dsh-preset-lint-local";

/**
 * preset 保存后钩子：监听用户 preset 根目录（~/.dsh/.agent-presets），
 * agent.cordis.yml 变化后（1.5s 防抖）直接 import lint-preset.mjs 的 lintFile
 * 做静态校验，错误经 ctx.logger 写入宿主日志。
 * 启动 5s 后对存量 preset 全量串行扫一遍。
 */
export function apply(ctx) {
  const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  const presetRoot = join(dshHome, ".agent-presets");
  const linterPath = process.env.DSH_LINT_PATH ?? "/Users/lute/project/Magpie-Horch/dsh-patches/lint-preset.mjs";

  let timer = void 0;
  let chain = Promise.resolve();
  const disposers = [];

  const lintOne = async (file) => {
    try {
      const { lintFile } = await import(linterPath);
      const { errors, warnings } = lintFile(file);
      if (errors.length > 0) {
        ctx.logger.warn(`preset-lint: ${file} — ${errors.slice(0, 6).join(" | ")}`);
      } else if (warnings.length > 0) {
        ctx.logger.info(`preset-lint: ${file} OK（${warnings.length} 警告）`);
      } else {
        ctx.logger.info(`preset-lint: ${file} OK`);
      }
    } catch (cause) {
      ctx.logger.warn(`preset-lint: lint failed for ${file}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  };
  const enqueue = (file) => {
    chain = chain.then(() => lintOne(file)).catch(() => {});
  };

  // 启动 5s 后对存量 preset 串行全量扫一遍（不阻塞 boot）
  const initialTimer = setTimeout(() => {
    try {
      for (const dir of readdirSync(presetRoot)) {
        const file = join(presetRoot, dir, "agent.cordis.yml");
        if (existsSync(file)) enqueue(file);
      }
    } catch {}
  }, 5000);
  disposers.push(() => clearTimeout(initialTimer));

  let watcher;
  try {
    watcher = watch(presetRoot, { recursive: true }, (_event, filename) => {
      if (typeof filename !== "string" || !filename.endsWith("agent.cordis.yml")) return;
      clearTimeout(timer);
      timer = setTimeout(() => enqueue(join(presetRoot, filename)), 1500);
    });
    disposers.push(() => watcher.close());
  } catch (cause) {
    ctx.logger.warn(`preset-lint: cannot watch ${presetRoot}: ${cause instanceof Error ? cause.message : String(cause)}`);
    return;
  }

  ctx.on("dispose", () => {
    clearTimeout(timer);
    for (const dispose of disposers) { try { dispose(); } catch {} }
  });
}
