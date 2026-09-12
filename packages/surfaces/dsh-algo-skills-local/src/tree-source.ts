/**
 * Real-filesystem binding for the tree collector.
 *
 * Kept separate from `collect.ts` so the collector stays pure and testable, and
 * so every path this plugin reads is visible in one place. Two roots, both
 * derived the way the official packages derive them (DSH_HOME, else `~/.dsh`):
 *
 *   - `<home>/skills` — the installed skills root; only `p2s-*` directories are
 *     scanned, because the cards this surface carries are exactly those.
 *   - `<home>/.agent-presets` — the role roster; only `agt-*` directories.
 *
 * A missing root is not an error: it yields an empty list, and the page states
 * coverage from the totals it actually found rather than pretending the machine
 * is fully provisioned.
 * @module dsh-algo-skills-local/tree-source
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { TreeSource } from './collect.ts'

/** Skill directory prefix this surface carries. */
export const SKILL_PREFIX = 'p2s-'

/** Role preset directory prefix. */
export const ROLE_PREFIX = 'agt-'

/**
 * Resolve the harness home the same way the official packages do.
 * @param override - explicit home (plugin config).
 * @returns absolute harness home.
 */
export function resolveDshHome(override?: string): string {
  if (override !== undefined && override !== '') return override
  const fromEnv = process.env['DSH_HOME']
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv
  return join(homedir(), '.dsh')
}

/** Directory names under `root` that start with `prefix` and are directories. */
function listDirs(root: string, prefix: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith(prefix)) continue
    try {
      if (statSync(join(root, entry)).isDirectory()) out.push(entry)
    } catch {
      // 目录在扫描与 stat 之间消失：跳过，不让一次竞态打断整棵树。
    }
  }
  return out.sort()
}

/**
 * Build the disk-backed source.
 * @param options - roots (defaults derive from DSH_HOME).
 * @returns a TreeSource reading the live machine.
 */
export function diskSource(options?: { dshHome?: string; skillsRoot?: string; presetRoot?: string }): TreeSource {
  const home = resolveDshHome(options?.dshHome)
  const skillsRoot = options?.skillsRoot !== undefined && options.skillsRoot !== ''
    ? options.skillsRoot
    : join(home, 'skills')
  const presetRoot = options?.presetRoot !== undefined && options.presetRoot !== ''
    ? options.presetRoot
    : join(home, '.agent-presets')
  return {
    skillsRoot,
    presetRoot,
    listSkillDirs: () => listDirs(skillsRoot, SKILL_PREFIX),
    readSkillFile: (dir) => readFileSync(join(skillsRoot, dir, 'SKILL.md'), 'utf8'),
    listRoleDirs: () => listDirs(presetRoot, ROLE_PREFIX),
    readRoleManifest: (dir) => {
      const file = join(presetRoot, dir, 'manifest.json')
      if (!existsSync(file)) return undefined
      try {
        return readFileSync(file, 'utf8')
      } catch {
        return undefined
      }
    },
  }
}
