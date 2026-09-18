/**
 * Which checkout a witness test attests, and when it is allowed to have an
 * opinion (QG-006B).
 *
 * ## Why this module exists
 *
 * Every test in this family answers "did this run change the repository?". On a
 * checkout that other processes are writing to, that question has no answer —
 * and the two wrong answers are both harmful: reporting "changed" frames a
 * neighbour's write as a gate side effect, while reporting "unchanged" would
 * require not looking. Measured 2026-09-17: this working tree is edited by
 * several concurrent agent sessions, and the witness tests caught three
 * different external writers in one afternoon (this session editing ADR-0103,
 * a Codex session writing `refs/codex/**`, another session writing
 * `.scratch/gate-scope-readout/**`).
 *
 * So the contract is:
 *
 * - `DSH_ATTEST_REPO` names the checkout under test. Set it to an exclusive
 *   clone and the tests run for real, anywhere, at full strength.
 * - Without it, the tests run against this repository **only while it is quiet**.
 *   A short probe (three snapshots, three seconds apart) decides; a noisy
 *   checkout reports a skip that says which paths moved, never a pass and never
 *   a "side effect" verdict.
 * - Setting `DSH_ATTEST_REPO` also bypasses the probe: an exclusive clone is
 *   quiet by construction, and probing it would just be three seconds of doubt.
 *
 * This is ADR-0102 applied to the witness itself: "no reading" and "clean
 * reading" must not print the same thing.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { identical, snapshotRepo } from './repo-snapshot.mjs'

/** Root of the checkout these modules ship in (scripts/lib → repo root). */
export const HARNESS_ROOT = join(import.meta.dirname, '..', '..')

/** `true` when the caller pointed the tests at an exclusive clone. */
export function hasExplicitRepo() {
  const value = process.env.DSH_ATTEST_REPO
  return typeof value === 'string' && value.length > 0
}

/**
 * Decide which checkout to attest.
 *
 * @param {string} fallback absolute path to this repository
 * @returns {string} absolute path to the checkout under test
 */
export function resolveAttestRepo(fallback = HARNESS_ROOT) {
  const explicit = process.env.DSH_ATTEST_REPO
  if (typeof explicit === 'string' && explicit.length > 0) {
    if (!existsSync(explicit)) {
      throw new Error(`DSH_ATTEST_REPO 指向的路径不存在：${explicit}`)
    }
    return explicit
  }
  return fallback
}

/**
 * Probe whether the checkout is currently free of other writers.
 *
 * @param {string} repoRoot
 * @param {{probes?: number, gapMs?: number}} [options]
 * @returns {{quiet: boolean, probes: number, diffs: string[]}}
 */
export function probeQuietRepo(repoRoot, { probes = 3, gapMs = 3000 } = {}) {
  let previous = snapshotRepo(repoRoot)
  const diffs = []
  for (let index = 1; index < probes; index += 1) {
    // Synchronous wait: the probe sits between two snapshots inside a sync test.
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, gapMs)
    const current = snapshotRepo(repoRoot)
    for (const diff of identical(previous, current).diffs) diffs.push(`${diff.kind}:${diff.path}`)
    previous = current
    if (diffs.length > 0) break
  }
  return { quiet: diffs.length === 0, probes, diffs: [...new Set(diffs)].slice(0, 5) }
}

/**
 * Gate for witness tests: returns a skip reason when the checkout cannot be
 * attested, or `null` when the test should run.
 *
 * @param {string} repoRoot the resolved checkout under test
 * @returns {string|null} reason to skip, or null to proceed
 */
export function attestSkipReason(repoRoot) {
  if (hasExplicitRepo()) return null
  const probe = probeQuietRepo(repoRoot)
  if (probe.quiet) return null
  return `本仓库在探测窗口内被外部写入（${probe.diffs.join('、')}）——`
    + `「有人写这个工作树」与「这次运行有副作用」是两种事实，本项在此环境下没有读数。`
    + `把 DSH_ATTEST_REPO 指向一份独占副本（clean clone）即可拿到真读数。`
}
