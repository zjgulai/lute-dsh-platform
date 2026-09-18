#!/usr/bin/env node
/**
 * `dsh-settings-shell` 的**实况 AX 几何探针**（P-15 生效路径的最后一段）。
 *
 * ## 它回答的问题（单测与 headless 都答不了的那些）
 *
 * `packages/platform/dsh-settings-shell-local` 的用例跑在 happy-dom 与真实 bundle seam 上，
 * 它们证明的是「给定这份 DOM，注入器会形成这个结构与样式契约」。**不**证明：
 *
 *   1. 运行中的那个实例**装载了**这个包。P-15 的原话：磁盘 <-> 磁盘的一致性是完整的，
 *      错的只是「所以它已经生效了」这一步推论——**没有任何静态判据能回答「跑着的那个
 *      进程读的是不是它」**。唯一能回答的是**可见读数**，也就是本探针。
 *   2. L1 真的修好了：设置导航 18 项里最后几项被压扁（实测 `桌面设置` / `侧边卡片`
 *      高 0.83 CSS px、`我说` 28.33 CSS px），而这是**几何事实**，不是文本事实——
 *      DOM 里它们一直在，只是点不到。
 *   3. L2 真的生效了：面板宽度 800 -> 960 CSS px、导航栏出现 5 个分组标题。
 *
 * ## 判据为什么是「比值 + 校准」而不是「像素」
 *
 * 实机开着 **zoom 1.2**：官方 800 CSS px 的面板在 AX 里量到 **960 AX px**，官方
 * `min(800, 100vh-48)` 的 752 CSS px 量到 **903 AX px**（两个独立维度给出同一个
 * 1.2，见基线）。于是「面板 960」这句话在 AX 读数里**同时**是「官方原样」与
 * 「我的 960 目标」——直接比像素会把两个相反的状态读成同一个数。
 * 本探针因此不赌 zoom 常量，而是用 pinned upstream Settings CSS 里的两个**独立锚**
 * 现场校准：导航列宽 188 CSS px、关闭按钮 28×28 CSS px。它们来自两个 AX 节点，
 * 且都不属于被验收的导航按钮集合。目标按钮高度只在 scale 固定后再测，不能反过来
 * 参与 scale 计算；否则 `zoom = button/40` 再算 `button/zoom` 会恒等于 40，形成假绿。
 *
 * ## 仪器自检（没有它这片绿色不可信）
 *
 * - `harness-alive`：`macos-harness doctor` 的 accessibility 必须为 true，否则 exit 2。
 * - `app-alive`：必须按 bundle id 找到运行中的 `ai.deepseek.dsh.desktop`。
 * - `window-off-screen`：探针会**先自愈**（`set frontmost` + 轮询），把窗口拉回屏上；
 *   拉不回来才是 exit 2。**这条是本探针最贵的一课**：Chromium 的 AX 子树懒建，
 *   且**只对屏上的窗口建**。同一个进程、同一份代码实测两态 —— 窗口在后台时 AX 树
 *   **1 个节点**（只剩 AXApplication），`set frontmost` 之后 **1323 个节点**、几何齐全。
 *   2026-09-15 就是把它读成了「app 的 Accessibility 子树没有内容 → 仪器不可用」，
 *   并据此让用户重启应用；**重启当然没用**，新窗口照样不在前台。P-04 点名的那一类：
 *   错误报告路径自己一炸，把真实原因盖住了。
 * - `ax-alive`：AX 树必须能读出那个窗口且宽度 > 800 —— 证明 AX 真的在读 Electron。
 * - `settings-opened`：左栏必须能数到 >= 10 个导航按钮。**数不到一律 exit 2
 *   （仪器不可用），不是 exit 1**：分不清「页面没打开」与「AX 看不见导航」，
 *   就不该把任何一个读成判决。设置页**已经开着**时会直接复用那个对话框
 *   （模态会盖掉自己的触发器，只认触发器会得到假红）。
 * - `settings-entry-unreadable`：树里有窗口却没有设置入口、也没有已开的设置页时给出
 *   **它自己的**分类，而不是并进 `window-off-screen`。2026-09-18 实测：入口的
 *   可访问名挂在 `AXDescription` 上（`AXTitle=""`），旧写法只认 title，于是把
 *   「窗口在屏上、882 个节点可读」报成「窗口拉不到前台」，又一次把人骗去重启（P-04）。
 *   入口规则见 `SETTINGS_TRIGGER_NAME_FIELDS` 的注释，自检里有 8 个夹具与 4 条同源断言钉它。
 * - `calibration-alive`：188px nav 与 28×28px close 三个读数必须一致；缺失、比例冲突、
 *   取错窗口、非正尺寸或与目标按钮样本重叠都 typed unavailable，不产出判决。
 *
 * ## 判据为什么是这两条几何读数
 *
 * L1 用「导轨独立滚动」**加上**「滚到底末项拿得到全高」，两条都要：
 *
 * - 前者是**判别器**：基线里 nav 不是滚动容器，`AXScrollToVisible` 滚的是 panel 的
 *   `overflow:hidden`，于是导轨与右侧内容区**一起**位移；本包生效后内容区不动。
 * - 后者是**用户真正要的结果**：基线里末两项恒为 0.83 CSS px，滚到底也拿不到全高。
 *
 * 两条**都曾经被写错**，都留下了读数：
 *
 * 1. 「`AXScrollToVisible` 调用成功」——基线里它同样成功，射程为零（已删）。
 * 2. 「AX 里出现滚动区域（AXScrollArea）」——**射程同样为零**。当初的推理是
 *    「官方 nav 无 overflow → 不是滚动容器；本包加了 `overflow-y:auto` → 应当出现
 *    AXScrollArea」。前提错了：AX 里 nav 落成
 *    `AXGroup subrole="AXLandmarkNavigation"`（HTML `<nav>` 的语义映射），
 *    而 Chromium 每个节点只给**一个** role —— 它不会在 landmark 之外再叠一个
 *    AXScrollArea。这条判据无论修好没修好都恒为 0，会把**已达标**的状态判成红，
 *    因此已从报告与判决中删除，只保留这段反例说明。
 *
 * ## 边界（诚实写清楚）
 *
 * - 探针会**打开并关闭**设置页（`AXPress` 后 `Escape`）。这是对用户 GUI 的一次真实
 *   交互；`finally` 里无条件尝试关闭，并在报告里记 `closed`。若设置页**本来就是
 *   用户开着的**，探针不替用户关（`dialogWasOpen=true`、`closed=false`），也不按触发器。
 * - 它**不**验证分组归属是否正确（哪一项在哪个标题下）。那由 `groups.spec.ts` 的
 *   连续性与排定用例覆盖；本探针只数**标题出现了几个**。
 * - 静止时视口外的项会报 0 高，**那是滚动容器的正常读数，不是缺陷**；缺陷由
 *   「滚到底之后」的读数判。`clippedAtRest` 只作留痕。
 *
 * 本探针曾经写出过一条**射程为零**的判据：直接 `curl /plugins/dsh-settings-shell/client.js`
 * 拿 404 当作「实例里没有这个包」。对照一个**已知能用**的包（`dsh-ui-polish`）同样 404，
 * 而该 HTTP 面整体是 401 守卫的——这条判据无论重启前后都只会回 404。所以本探针
 * **不用 HTTP**，只用 AX 几何。
 *
 * 用法：`node scripts/acceptance/settings-shell-live.mjs [--out <dir>] [--require-no-skip]`
 * 退出码：0 = 已生效且 L1/L2 全部达标；1 = 已生效但有判据未达标；
 *         2 = 前置条件或仪器 typed unavailable；**3 = 实例早于本包，需要重启才能判决**。
 * `--require-no-skip` 会把 typed unavailable 作为 strict failure（exit 1）。
 */
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { assertNodeUsable } from '../lib/real-node.mjs'

const execFileAsync = promisify(execFile)

class ProbeUnavailableError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProbeUnavailableError'
    this.code = code
  }
}

const unavailable = (code, message) => new ProbeUnavailableError(code, message)
const HARNESS_TIMEOUT_MS = 20_000

function unavailableExitCode(requireNoSkip) {
  return requireNoSkip ? 1 : 2
}

/**
 * 跑一段 python 给 `macos-harness`。
 *
 * **不能用 `execFile` 的 `input` 选项**：那是 `execFileSync` / `spawnSync` 才有的，
 * 异步版没有它。写了它不会报错，只会被静默忽略，然后 harness 永远等 stdin ——
 * 2026-09-15 实测的表现是探针挂到外层超时被杀。必须自己写 stdin 并 end()。
 */
function runHarness(bin, args = [], program = '') {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let forceKillTimer
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      forceKillTimer = setTimeout(() => { child.kill('SIGKILL') }, 1_000)
    }, HARNESS_TIMEOUT_MS)
    child.stdout.on('data', (d) => { stdout += d })
    child.stderr.on('data', (d) => { stderr += d })
    child.on('error', (error) => {
      clearTimeout(timer)
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer)
      rejectPromise(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer)
      if (timedOut) {
        rejectPromise(unavailable(
          'instrument-timeout',
          `macos-harness 超过 ${HARNESS_TIMEOUT_MS}ms 未返回，本次不产出判决`,
        ))
        return
      }
      resolvePromise({ code, stdout, stderr })
    })
    child.stdin.end(program)
  })
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROFILE_DIR = join(homedir(), '.dsh', 'profiles', 'desktop')
const PKG_NAME = 'dsh-settings-shell'
const BUNDLE_ID = 'ai.deepseek.dsh.desktop'
const SENTINEL = '__AX_REPORT__'

/** 官方导航按钮高度（CSS px）；它是被验收目标，不再参与校准。 */
const OFFICIAL_BUTTON_CSS_PX = 40
/** 两个与目标按钮样本不相交的官方 Settings 常量。 */
const OFFICIAL_NAV_CSS_PX = 188
const OFFICIAL_CLOSE_CSS_PX = 28
/** 我们声明的面板宽度上限（CSS px），见 `src/client/shell.css`。 */
const TARGET_PANEL_CSS_PX = 960
/** 官方面板宽度（CSS px），用作「未生效」的对照。 */
const OFFICIAL_PANEL_CSS_PX = 800
/** 低于中位高度的这个比例 = 被压扁（基线实测：0.83/40.83 = 2%）。 */
const CRUSH_RATIO_MAX = 0.5
/** 校准锚的相对残差，小控件另有 1.5 AX px 的取整下限。 */
const CALIBRATION_RESIDUAL_RATIO = 0.04
const CALIBRATION_RESIDUAL_AX_MIN = 1.5
/** 目标导航按钮只允许 40±2 CSS px；该高度不参与 scale 计算。 */
const BUTTON_CSS_TOLERANCE = 2
/** 面板宽度的相对容差。 */
const PANEL_CSS_TOLERANCE_RATIO = 0.04
/** 本包注入的分组标题（`src/client/groups.ts` 的 `SETTINGS_GROUPS` 的 zh 文案）。 */
const GROUP_TITLES = ['通用', '智能体', '技能与能力', '扩展', '界面与个人']

/**
 * 「末项可达」的判定线：滚到底后末项高度 / 中位按钮高。
 * 基线里末两项**恒为 0.83 CSS px**（面板 `overflow:hidden` 裁掉，nav 不可滚）。
 */
const REACHABLE_RATIO_MIN = 0.8

/**
 * 「AX 子树建全了吗」的下界（节点数）。
 *
 * 2026-09-18 实测：Chromium 的 AX 子树是**增量**建的，同一个进程、同一份代码，
 * 模态关掉之后连续三次 dump 读到 **32 → 262 → 599** 个节点，几分钟后稳定在 599
 * （含侧栏页脚的设置入口）。实测的合法树规模：设置页盖住主界面 152~288，主界面 599~1344。
 *
 * 所以它只用来分「该继续重试」与「该报缺入口」，**不是判据**：
 * 32 个节点时报「找不到设置入口」是把「树还没建全」说成了「入口不存在」——
 * 与 `window-off-screen` 同型的错报（P-04）。
 */
const AX_TREE_FLOOR = 120

/** 树没建全时多试几次：每次自愈 + 2s 轮询，10 次 ≈ 20s（够实测的建树过程走完）。 */
const ENSURE_ON_SCREEN_ATTEMPTS = 10

/**
 * 「设置入口」的可访问名规则 —— 本探针两处读数（SIGHT / AX 程序）与自检的**唯一家**。
 *
 * ## 为什么名字要在两个字段里找
 *
 * 2026-09-18 实测（本机运行实例，pid 35597）：设置页**没开着**时，那个入口节点是
 * `AXPopUpButton`，**`AXTitle=""`、`AXDescription="设置"`** —— 可访问名挂在
 * `AXDescription` 上（就是 `mac.ax.dump` 节点里那个 `description` 字段）。
 * 只认 `AXTitle` 的写法在这个状态判 `hasTrigger=false`，于是 `ensureOnScreen()` 连试 6 次
 * 后抛 **`window-off-screen`「窗口拉不到前台」** —— 而当时窗口明明在屏上、AX 树里 882 个
 * 节点可读。这是 P-04 那一类：错误报告路径把真实原因盖住，**并且会再把人骗去重启一次**
 * （本文件 `ensureOnScreen` 的注释里已经记过一次同型的浪费）。
 *
 * ## 为什么不写成「按名字找按钮」就完事
 *
 * `AXTitle` 与 `AXDescription` 都是 ARIA 语义面（name-from-contents 与 aria-label），
 * 不是类名解析；ADR-0087 要求的正是「锚点取 ARIA 语义」。**两个字段都要认**，因为
 * 上游把名字放哪一个是实现细节：只认一个就是把「上游此刻的实现」当成了契约。
 *
 * ## 单一家的边界（诚实写清楚）
 *
 * AX 读数由内嵌的 python 程序产出，JS 侧拿不到那些节点，所以规则在两个语言里各有一个
 * **求值器**：`isSettingsTrigger()`（JS，供自检）与 `pyTriggerPredicate()`（生成 python 片段）。
 * 两者都只消费下面这组常量——**改规则只能改常量**，改完两侧同时变；
 * 自检里有一条断言专门钉这件事（生成物必须覆盖每个字段与每个角色）。
 */
const SETTINGS_TRIGGER_NAME = '设置'
const SETTINGS_TRIGGER_ROLES = ['AXPopUpButton', 'AXButton']
const SETTINGS_TRIGGER_NAME_FIELDS = ['title', 'description']

/** JS 侧求值器：只用于自检，不参与实况读数（实况走 python）。 */
function isSettingsTrigger(node) {
  if (node === null || typeof node !== 'object') return false
  if (!SETTINGS_TRIGGER_ROLES.includes(node.role)) return false
  return SETTINGS_TRIGGER_NAME_FIELDS.some(
    (field) => String(node[field] ?? '').trim() === SETTINGS_TRIGGER_NAME,
  )
}

/** python 侧求值器：由同一组常量生成，插进 SIGHT / AX 两个程序模板。 */
function pyTriggerPredicate() {
  const nameChecks = SETTINGS_TRIGGER_NAME_FIELDS
    .map(
      (field) =>
        `str(n.get(${JSON.stringify(field)}) or "").strip() == ${JSON.stringify(SETTINGS_TRIGGER_NAME)}`,
    )
    .join('\n        or ')
  const roles = SETTINGS_TRIGGER_ROLES.map((role) => JSON.stringify(role)).join(', ')
  return `((${nameChecks})\n     and n.get("role") in (${roles},))`
}

const failures = []
const notes = []

function typedUnavailableReport(error) {
  return {
    at: new Date().toISOString(),
    status: 'unavailable',
    verdict: null,
    typedSkips: [{ type: error.code, count: 1, reason: error.message }],
    failures,
    notes,
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 探针自己写的一段 python：一次 harness 调用里开→读→判→关，不留半开状态。 */
const AX_PROGRAM = `
import json, time
SENTINEL = ${JSON.stringify(SENTINEL)}
BUNDLE_ID = ${JSON.stringify(BUNDLE_ID)}
GROUP_TITLES = ${JSON.stringify(GROUP_TITLES)}

rep = {"steps": [], "errors": [], "pressed": False, "closed": None}
APPNAME = None

def median(xs):
    xs = sorted(xs)
    if not xs: return None
    m = len(xs) // 2
    return (xs[m-1] + xs[m]) / 2.0 if len(xs) % 2 == 0 else float(xs[m])

def dump(n):
    return mac.ax.dump(APPNAME, max_nodes=n).get("nodes", [])

def rail_of(ns, nav):
    rf = nav["frame"]
    lo, hi = rf["x"] - 3, rf["x"] + rf["width"] + 3
    b = [n for n in ns if n.get("role") == "AXButton"
         and (n.get("frame") or {}).get("width", 0) >= 100
         and (n.get("frame") or {}).get("x") is not None
         and lo <= n["frame"]["x"] <= hi]
    b.sort(key=lambda n: n["frame"]["y"])
    return b

def options_y(ns, nav):
    rf = nav["frame"]
    ox = rf["x"] + rf["width"]
    ys = [n["frame"]["y"] for n in ns if n.get("role") == "AXStaticText"
          and (n.get("frame") or {}).get("y") is not None
          and (n.get("frame") or {}).get("x") is not None
          and n["frame"]["x"] >= ox]
    return median(ys)

def inside(outer, inner, tol=3):
    if not outer or not inner: return False
    return (inner.get("x", 0) >= outer.get("x", 0) - tol
            and inner.get("y", 0) >= outer.get("y", 0) - tol
            and inner.get("x", 0) + inner.get("width", 0) <= outer.get("x", 0) + outer.get("width", 0) + tol
            and inner.get("y", 0) + inner.get("height", 0) <= outer.get("y", 0) + outer.get("height", 0) + tol)

try:
    app = next((a for a in mac.list_apps() if a.get("bundle_id") == BUNDLE_ID), None)
    if app is None:
        rep["errors"].append("app-not-running")
        raise SystemExit
    APPNAME = app["name"]
    rep["app"] = {"name": app["name"], "pid": app["pid"]}

    nodes = dump(2000)
    rep["axNodeCount"] = len(nodes)
    win = next((n for n in nodes if n.get("role") == "AXWindow"), None)
    rep["window"] = win.get("frame") if win else None

    # 设置页可能**已经开着**（用户自己开的，或上一次探针异常退出留下的 —— 2026-09-15
    # 实测就是这么被绊住的）。只认「设置」触发器的写法在这种状态下必然报
    # 「settings-trigger-missing」，把**一个完全可判定的状态**报成仪器故障：假红。
    # 模态对话框会把自己的触发器从 AX 树里盖掉，所以「找不到触发器」本身不是证据。
    already = any((n.get("subrole") or "") == "AXApplicationDialog" for n in nodes)
    rep["dialogWasOpen"] = already
    if already:
        after = nodes
        rep["closed"] = False      # 用户开着的东西不替用户关
    else:
        trig = next((n for n in nodes if ${pyTriggerPredicate()}), None)
        if trig is None:
            rep["errors"].append("settings-trigger-missing")
            raise SystemExit

        mac.ax.perform(trig["element_index"], "AXPress")
        rep["pressed"] = True
        time.sleep(2.0)
        after = dump(4000)

    named_panels = [n for n in after
                    if n.get("role") == "AXGroup" and (n.get("title") or "").strip() == "设置"
                    and (n.get("frame") or {}).get("height", 0) > 200]
    panel_candidates = named_panels
    if not panel_candidates:
        big = [n for n in after if n.get("role") == "AXGroup"
               and (n.get("frame") or {}).get("height", 0) > 200
               and (n.get("frame") or {}).get("width", 0) > 400]
        big.sort(key=lambda n: n["frame"]["width"] * n["frame"]["height"], reverse=True)
        if big:
            top_area = big[0]["frame"]["width"] * big[0]["frame"]["height"]
            panel_candidates = [n for n in big
                                if n["frame"]["width"] * n["frame"]["height"] >= top_area * 0.98]
    rep["panelCandidateCount"] = len(panel_candidates)
    panel = panel_candidates[0] if len(panel_candidates) == 1 else None
    rep["panel"] = panel.get("frame") if panel else None
    if panel is None:
        rep["errors"].append("panel-candidate-ambiguous" if panel_candidates else "panel-candidate-missing")
        raise SystemExit

    nav = None
    if panel:
        pf = panel["frame"]
        cand = [n for n in after if n.get("role") == "AXGroup"
                and abs((n.get("frame") or {}).get("x", -1) - pf["x"]) < 3
                and (n.get("frame") or {}).get("height", 0) >= pf["height"] * 0.8
                and (n.get("frame") or {}).get("width", 0) < pf["width"] * 0.5]
        rep["navCandidateCount"] = len(cand)
        nav = cand[0] if len(cand) == 1 else None
    rep["nav"] = nav.get("frame") if nav else None
    if nav is None:
        rep["errors"].append("nav-candidate-missing" if not cand else "nav-candidate-ambiguous")
        raise SystemExit

    # 第二个独立校准节点：Settings header 右上角的 28x28 close button。
    # 文案会本地化，所以只用 panel/nav 的相对几何选最右上候选；
    # 最右位置若不唯一就不猜，交给 typed unavailable。
    pf, nf = panel["frame"], nav["frame"]
    close_candidates = [n for n in after if n.get("role") == "AXButton"
                        and inside(pf, n.get("frame"))
                        and (n.get("frame") or {}).get("x", 0) >= nf["x"] + nf["width"] - 3
                        and (n.get("frame") or {}).get("y", 10**9) <= pf["y"] + min(120, pf["height"] * 0.18)
                        and 12 <= (n.get("frame") or {}).get("width", 0) <= 80
                        and 12 <= (n.get("frame") or {}).get("height", 0) <= 80
                        and abs(n["frame"]["width"] - n["frame"]["height"]) <= 8]
    right_edge = max((n["frame"]["x"] + n["frame"]["width"] for n in close_candidates), default=None)
    close_winners = [n for n in close_candidates
                     if abs(n["frame"]["x"] + n["frame"]["width"] - right_edge) <= 1] if right_edge is not None else []
    rep["closeCandidateCount"] = len(close_winners)
    rep["closeCandidates"] = [{"elementIndex": n.get("element_index"), "title": n.get("title"), "frame": n.get("frame")}
                              for n in close_candidates]
    close = close_winners[0] if len(close_winners) == 1 else None
    rep["closeAnchor"] = ({"elementIndex": close.get("element_index"), "title": close.get("title"), "frame": close.get("frame")}
                          if close else None)
    if close is None:
        rep["errors"].append("close-candidate-missing" if not close_winners else "close-candidate-ambiguous")
        raise SystemExit

    rep["calibrationAnchors"] = [
        {"id": "settings-nav-width", "elementIndex": nav.get("element_index"),
         "observedAxPx": nf["width"], "expectedCssPx": ${OFFICIAL_NAV_CSS_PX}},
        {"id": "settings-close-width", "elementIndex": close.get("element_index"),
         "observedAxPx": close["frame"]["width"], "expectedCssPx": ${OFFICIAL_CLOSE_CSS_PX}},
        {"id": "settings-close-height", "elementIndex": close.get("element_index"),
         "observedAxPx": close["frame"]["height"], "expectedCssPx": ${OFFICIAL_CLOSE_CSS_PX}},
    ]

    # 这里**曾经**算过一个 rep["scrollRoles"]（「AX 里出没出现 AXScrollArea」），
    # 2026-09-15 实测它**射程为零**：AX 里 nav 落成
    # 「AXGroup subrole=AXLandmarkNavigation」（HTML nav 元素的语义映射），而 Chromium
    # 每个节点只给**一个** role —— 它不会在 landmark 之外再叠一个 AXScrollArea。
    # 于是那个读数无论修好没修好都恒为空，把**已达标**的状态判成红。
    # 它已被整段删除并登记进 scripts/gates/dead-instruments.json（ADR-0080），
    # 免得下一个人再把它捡回来当判据。能区分两个状态的是下面两条几何读数。

    btns = rail_of(after, nav)
    rep["buttons"] = [{"label": n.get("title"), "elementIndex": n.get("element_index"), "frame": n["frame"]} for n in btns]
    rep["optionsYBefore"] = options_y(after, nav)

    heads = [n for n in after if n.get("role") == "AXStaticText"
             and (n.get("value") or "").strip() in GROUP_TITLES
             and (n.get("frame") or {}).get("y") is not None
             and abs((n.get("frame") or {}).get("x", -1) - nav["frame"]["x"]) < nav["frame"]["width"] + 6]
    rep["headings"] = sorted([(n.get("value") or "").strip() for n in heads])

    # —— L1 的行为判据 ——
    # AXScrollToVisible 会在**最近的**滚动容器里把目标滚进视野。基线里 nav 不是滚动容器，
    # 于是它滚的是 **panel**：轨道与右侧内容区会**一起位移**。本包生效后 nav 自己成为
    # 滚动容器，于是只滚 nav、右侧内容区**不动**。
    # 这条判据能区分两个状态；「AXScrollToVisible 调用成功」不能（基线里它同样成功）。
    if btns:
        try:
            mac.ax.perform(btns[-1]["element_index"], "AXScrollToVisible")
            time.sleep(1.5)
            ns2 = dump(4000)
            b2 = rail_of(ns2, nav)
            rep["railFirstYAfter"] = b2[0]["frame"]["y"] if b2 else None
            rep["optionsYAfter"] = options_y(ns2, nav)
            rep["railLastHeightAfter"] = b2[-1]["frame"]["height"] if b2 else None
            rep["buttonsAfter"] = [{"label": n.get("title"), "elementIndex": n.get("element_index"), "frame": n["frame"]} for n in b2]
        except Exception as e:
            rep["errors"].append("scroll-probe-failed:" + type(e).__name__)
    rep["railFirstYBefore"] = btns[0]["frame"]["y"] if btns else None
except SystemExit:
    # 上面几处 raise SystemExit 是「提前收工」的信号，不是错误：它们带着
    # rep["errors"] 里那条分类原因，交给下面的 finally 收尾后**照常打印哨兵行**。
    pass
except Exception as e:
    # 任何没预料到的异常都必须变成**报告里的一条读数**，而不是让整段程序静默死掉。
    # 2026-09-15 实测的代价：app 的 AX 子树整体不可用时（只剩 AXApplication 一个节点），
    # dump 之后的 next(...) 抛异常 → 异常逃出 try → 哨兵行**从未打印** →
    # 调用方只看到「harness 未回传报告」，把「AX 树是空的」误报成「仪器挂了」。
    # 错误报告路径自己一炸反而盖住真实错误，正是 P-04 点名的那一类。
    rep["errors"].append("probe-exception:" + type(e).__name__ + ":" + str(e)[:200])
finally:
    if rep["pressed"] and APPNAME is not None:
        try:
            mac.key("escape", app=APPNAME)
            time.sleep(1.0)
            left = mac.ax.dump(APPNAME, max_nodes=800).get("nodes", [])
            rep["closed"] = not any((n.get("title") or "").strip() == "通用设置"
                                    for n in left)
        except Exception as e:
            rep["errors"].append("close-failed:" + type(e).__name__)

print(SENTINEL + json.dumps(rep, ensure_ascii=False))
`

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function median(values) {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid]
}

/** 前置条件 + 仪器自检，任一不成立就 exit 2（不产出一片绿色）。 */
async function preflight() {
  let which
  try {
    which = await execFileAsync('which', ['macos-harness'])
  } catch {
    throw unavailable('harness-missing', '前置失败：`macos-harness` 不在 PATH 上（本探针全部读数依赖它）')
  }
  const harnessBin = which.stdout.trim()
  if (!harnessBin) throw unavailable('harness-missing', '前置失败：`macos-harness` 不在 PATH 上')

  const doctor = await runHarness(harnessBin, ['doctor'])
  if (doctor.code !== 0) {
    throw unavailable(
      'harness-doctor-failed',
      `macos-harness doctor exit ${doctor.code}: ${(doctor.stderr || doctor.stdout).slice(0, 200)}`,
    )
  }
  const docOut = doctor.stdout
  let doc
  try {
    doc = JSON.parse(docOut)
  } catch {
    throw unavailable('harness-doctor-invalid', '前置失败：`macos-harness doctor` 未输出 JSON：' + docOut.slice(0, 200))
  }
  if (doc?.permissions?.accessibility !== true) {
    throw unavailable('accessibility-permission-denied', '仪器自检失败 harness-alive：Accessibility 未授权（TCC 绑定宿主签名，重签后需重授）')
  }
  await ensureOnScreen(harnessBin)
  return harnessBin
}

/** 只读一眼窗口在不在屏上 + AX 树多大，不做任何写入。 */
const SIGHT_PROGRAM = `
import json
SENTINEL = ${JSON.stringify(SENTINEL)}
BUNDLE_ID = ${JSON.stringify(BUNDLE_ID)}
rep = {"errors": []}
app = next((a for a in mac.list_apps() if a.get("bundle_id") == BUNDLE_ID), None)
if app is None:
    rep["errors"].append("app-not-running")
else:
    ns = mac.ax.dump(app["name"], max_nodes=4000).get("nodes", [])
    rep["axNodeCount"] = len(ns)
    rep["hasWindow"] = any(n.get("role") == "AXWindow" for n in ns)
    rep["hasDialog"] = any((n.get("subrole") or "") == "AXApplicationDialog" for n in ns)
    rep["hasTrigger"] = any(${pyTriggerPredicate()} for n in ns)
print(SENTINEL + json.dumps(rep, ensure_ascii=False))
`

/**
 * 把窗口弄回**屏上**再读 AX —— 2026-09-15 实测的根因，不是可选的美化。
 *
 * Chromium 的 Accessibility 子树是**懒建**的，而且**只对屏上的窗口建**。同一个
 * 进程、同一份代码，实测两态：
 *
 *   - 窗口在后台（CG 层 `on_screen:false`）→ AX 树 **1 个节点**（只剩 AXApplication）
 *   - `set frontmost` 把它拉到前台 → 同一进程 **1323 个节点**，几何读数齐全
 *
 * 这条差异曾经被**误判成「仪器不可用」**：当时读到「AX 树只有 1 个节点」，于是写下
 * 「app 的 Accessibility 子树没有内容」，并让用户去重启应用 —— 重启当然没用，因为
 * 重启后新窗口照样不在前台。**"读不到" 与 "不在前台" 是两件事，报告必须分开说**，
 * 否则错误报告路径自己盖住了真实原因（P-04）。所以这里先自愈，自愈不成才报错，
 * 且报的是**具体那一条**（窗口不在屏上）。
 */
async function ensureOnScreen(harnessBin) {
  let last = null
  for (let i = 0; i < ENSURE_ON_SCREEN_ATTEMPTS; i += 1) {
    try {
      await execFileAsync('osascript', [
        '-e',
        `tell application "System Events" to set frontmost of (first process whose bundle identifier is "${BUNDLE_ID}") to true`,
      ], { timeout: 5_000 })
    } catch (err) {
      last = { errors: ['osascript-failed:' + String(err.message).slice(0, 120)] }
    }
    await sleep(2000)
    const sight = await runHarness(harnessBin, [], SIGHT_PROGRAM)
    if (sight.code !== 0) {
      last = { errors: [`harness-sight-failed:${sight.code}:${sight.stderr.slice(0, 120)}`] }
      continue
    }
    const { stdout } = sight
    const line = stdout.split('\n').find((l) => l.startsWith(SENTINEL))
    if (!line) {
      last = { errors: ['harness-no-report'] }
      continue
    }
    let r
    try {
      r = JSON.parse(line.slice(SENTINEL.length))
    } catch (error) {
      last = { errors: [`harness-report-invalid:${error.message}`] }
      continue
    }
    last = r
    // 「在屏上」用**树可用**判，不用节点数判 —— 节点数不是好代理：设置页（模态）
    // 开着时主界面被盖掉，整棵树**合法地**只有 135 个节点，拿 `>200` 判会把这个
    // 完全正常的状态误报成「窗口不在屏上」。真正的分界是**有没有 AXWindow**：
    // off-screen 实测整棵树只有 1 个节点（只剩 AXApplication），连窗口都没有。
    if (r.hasWindow && (r.hasTrigger || r.hasDialog)) return r
  }
  if (last?.errors?.includes('app-not-running')) {
    throw unavailable('app-not-running', `仪器自检失败 app-alive：没有运行中的 DSH Desktop（bundle id ${BUNDLE_ID}）`)
  }
  // 窗口能读到、但既没有设置入口、也没有已开的设置页 —— 这**不是**「窗口不在前台」。
  // 2026-09-18 之前这里两条并成一条报 `window-off-screen`，于是「入口的可访问名换了家」
  // 被读成「台面上没有那张窗口」，把人骗去重启应用（P-04）。分界就是 hasWindow：
  // off-screen 实测整棵树只有 1 个节点、连 AXWindow 都没有。
  if (last?.hasWindow === true && (last?.axNodeCount ?? 0) < AX_TREE_FLOOR) {
    throw unavailable('ax-tree-incomplete',
      `仪器自检失败 ax-tree-incomplete：窗口在屏上，但 AX 子树只有 ${last?.axNodeCount ?? '?'} 个节点` +
        `（< ${AX_TREE_FLOOR}，实测建全后 599~1344 量级）。Chromium 的 AX 子树是**增量**建的，` +
        `本探针已经自愈 + 轮询 ${ENSURE_ON_SCREEN_ATTEMPTS} 次仍未建全。` +
        '这既不是「窗口不在前台」，也不是「设置入口不存在」——重跑一次通常就好；' +
        '若稳定停在很小的节点数，再去看 Chromium 的 AX 是否被别的 AT 客户端占用。',
    )
  }
  if (last?.hasWindow === true) {
    throw unavailable('settings-entry-unreadable',
      `仪器自检失败 settings-entry-unreadable：窗口在屏上、AX 树可读（${last?.axNodeCount ?? '?'} 个节点，` +
        'hasWindow=true），但既找不到设置入口（`' + SETTINGS_TRIGGER_NAME + '`，' +
        `${SETTINGS_TRIGGER_ROLES.join(' / ')} 且 ${SETTINGS_TRIGGER_NAME_FIELDS.join(' 或 ')} 命中），` +
        '也没有已打开的设置页（AXApplicationDialog）。' +
        '这**不是**窗口不在前台，也**不是**插件没生效：先人工确认设置入口此刻是否真的存在，' +
        '以及它的可访问名/角色是否被上游改了 —— 若改了，按 ADR-0087 用 ARIA 语义重锚，别猜、别删断言。',
    )
  }
  throw unavailable('window-off-screen',
    `仪器自检失败 window-off-screen：窗口拉不到前台，AX 树停在 ${last?.axNodeCount ?? '?'} 个节点` +
      `（hasWindow=${last?.hasWindow}）。Chromium **只对屏上的窗口**建 AX 子树，` +
      '所以这不是「插件没生效」，也不是「harness 挂了」——是台面上没有那张窗口的读数。',
  )
}

/** 静态装载点核对：跑着的实例之外能查的那一半，先把「文件对不对」钉死。 */
function checkLoadpoint() {
  const repoEntry = join(REPO_ROOT, 'packages/platform/dsh-settings-shell-local/lib/client.js')
  const installedEntry = join(PROFILE_DIR, 'node_modules', PKG_NAME, 'lib/client.js')

  if (!existsSync(repoEntry)) {
    throw unavailable('repository-artifact-missing', `前置失败：仓库产物不存在 ${repoEntry}（先跑 pnpm --filter ${PKG_NAME} build）`)
  }
  if (!existsSync(installedEntry)) {
    throw unavailable('profile-loadpoint-missing', `前置失败：装载点不存在 ${installedEntry}（先跑 node scripts/sync-profile.mjs --apply --loadpoint）`)
  }

  const a = sha256(repoEntry)
  const b = sha256(installedEntry)
  const same = a === b
  if (!same) failures.push(`装载点与仓库产物不一致：${a.slice(0, 12)} != ${b.slice(0, 12)}`)

  let profilePkg
  try {
    profilePkg = JSON.parse(readFileSync(join(PROFILE_DIR, 'package.json'), 'utf8'))
  } catch (error) {
    throw unavailable('profile-manifest-invalid', `profile package.json 不可读：${error.message}`)
  }
  const inBundles = (profilePkg?.dsh?.profile?.bundles ?? []).includes(PKG_NAME)
  if (!inBundles) failures.push(`profile 的 dsh.profile.bundles 里没有 ${PKG_NAME}`)

  return { repoEntry, installedEntry, same, inBundles, sha: a.slice(0, 12) }
}

async function readAxis(harnessBin) {
  const run = await runHarness(harnessBin, [], AX_PROGRAM)
  if (run.code !== 0) {
    throw unavailable(
      'harness-axis-failed',
      `macos-harness AX probe exit ${run.code}: ${(run.stderr || run.stdout).slice(0, 300)}`,
    )
  }
  const { stdout } = run
  const line = stdout.split('\n').find((l) => l.startsWith(SENTINEL))
  if (!line) throw unavailable('harness-no-report', '仪器自检失败 ax-alive：harness 未回传报告：' + stdout.slice(0, 300))
  try {
    return JSON.parse(line.slice(SENTINEL.length))
  } catch (error) {
    throw unavailable('harness-report-invalid', `harness 报告不是合法 JSON：${error.message}`)
  }
}

function finitePositive(value) {
  return Number.isFinite(value) && value > 0
}

function frameContains(outer, inner, tolerance = 4) {
  if (outer === null || outer === undefined || inner === null || inner === undefined) return false
  for (const key of ['x', 'y', 'width', 'height']) {
    if (!Number.isFinite(outer[key]) || !Number.isFinite(inner[key])) return false
  }
  return inner.x >= outer.x - tolerance && inner.y >= outer.y - tolerance &&
    inner.x + inner.width <= outer.x + outer.width + tolerance &&
    inner.y + inner.height <= outer.y + outer.height + tolerance
}

/** nav 宽和 close square 是校准样本；目标导航按钮高度不参与 scale 计算。 */
function calibrateAxScale(ax) {
  for (const [field, expected] of [
    ['panelCandidateCount', 1],
    ['navCandidateCount', 1],
    ['closeCandidateCount', 1],
  ]) {
    if (ax[field] !== expected) {
      const prefix = field.replace('CandidateCount', '')
      const kind = ax[field] === undefined || ax[field] === 0 ? 'missing' : 'ambiguous'
      throw unavailable(
        `${prefix}-candidate-${kind}`,
        `${field}=${ax[field] ?? 'missing'}，不能唯一选中 Settings 几何锚`,
      )
    }
  }
  if (!frameContains(ax.window, ax.panel)) {
    throw unavailable('window-panel-mismatch', 'Settings panel 不在所选 AXWindow 内，本次可能取错窗口')
  }
  if (!frameContains(ax.panel, ax.nav) || !frameContains(ax.panel, ax.closeAnchor?.frame)) {
    throw unavailable('anchor-panel-mismatch', 'nav/close 校准锚不在同一 Settings panel 内')
  }

  const anchors = ax.calibrationAnchors ?? []
  const requiredIds = ['settings-nav-width', 'settings-close-width', 'settings-close-height']
  const anchorIds = anchors.map((anchor) => anchor.id)
  if (anchors.length !== requiredIds.length || new Set(anchorIds).size !== requiredIds.length ||
      requiredIds.some((id) => !anchorIds.includes(id))) {
    throw unavailable(
      'calibration-anchor-missing',
      `校准锚必须与声明集合全等：实得 ${anchorIds.join(',') || 'none'}`,
    )
  }
  const nodeIds = new Set(anchors.map((anchor) => anchor.elementIndex))
  if (nodeIds.has(undefined) || nodeIds.size < 2) {
    throw unavailable('calibration-node-identity', '校准必须来自 nav 与 close 两个独立 AX 节点')
  }

  const samples = anchors.map((anchor) => {
    if (!finitePositive(anchor.observedAxPx) || !finitePositive(anchor.expectedCssPx)) {
      throw unavailable(
        'calibration-non-positive',
        `校准锚 ${anchor.id} 尺寸非正：${anchor.observedAxPx}/${anchor.expectedCssPx}`,
      )
    }
    return { ...anchor, sampleScale: anchor.observedAxPx / anchor.expectedCssPx }
  })
  const scale = median(samples.map((sample) => sample.sampleScale))
  if (!finitePositive(scale)) throw unavailable('calibration-scale-invalid', `校准 scale 非正：${scale}`)

  const measured = samples.map((sample) => {
    const expectedAxPx = sample.expectedCssPx * scale
    const residualAxPx = Math.abs(sample.observedAxPx - expectedAxPx)
    const toleranceAxPx = Math.max(
      CALIBRATION_RESIDUAL_AX_MIN,
      expectedAxPx * CALIBRATION_RESIDUAL_RATIO,
    )
    return { ...sample, residualAxPx, toleranceAxPx }
  })
  const conflict = measured.find((sample) => sample.residualAxPx > sample.toleranceAxPx)
  if (conflict !== undefined) {
    throw unavailable(
      'calibration-anchor-conflict',
      `校准锚 ${conflict.id} 残差 ${conflict.residualAxPx.toFixed(2)} AX px 超过 ${conflict.toleranceAxPx.toFixed(2)}`,
    )
  }
  return {
    scale,
    anchors: measured.map((sample) => ({
      id: sample.id,
      elementIndex: sample.elementIndex,
      observedAxPx: sample.observedAxPx,
      expectedCssPx: sample.expectedCssPx,
      sampleScale: Number(sample.sampleScale.toFixed(5)),
      residualAxPx: Number(sample.residualAxPx.toFixed(3)),
      toleranceAxPx: Number(sample.toleranceAxPx.toFixed(3)),
    })),
  }
}

function judge(ax) {
  const errors = ax.errors ?? []
  if (errors.length > 0) {
    const first = String(errors[0])
    throw unavailable(first.split(':')[0], `AX 仪器未产出可判决快照：${errors.join(',')}`)
  }
  if (ax.window === null || ax.window === undefined) {
    throw unavailable('ax-window-missing', `自愈后仍读不到 AXWindow（AX 树 ${ax.axNodeCount ?? '?'} 个节点）`)
  }
  if (!finitePositive(ax.window.width) || ax.window.width < 800) {
    throw unavailable('ax-window-invalid', `窗口宽 ${ax.window.width} 不像一个真实窗口`)
  }

  const calibration = calibrateAxScale(ax)
  const buttons = ax.buttons ?? []
  if (buttons.length < 10) {
    throw unavailable('settings-buttons-insufficient', `左栏只数到 ${buttons.length} 个按钮，不判决`)
  }
  const targetIds = new Set(buttons.map((button) => button.elementIndex))
  if (targetIds.has(undefined) || calibration.anchors.some((anchor) => targetIds.has(anchor.elementIndex))) {
    throw unavailable('calibration-target-overlap', '校准样本与目标导航按钮样本必须不相交')
  }

  const mergedTargetHeights = new Map()
  for (const button of buttons) {
    if (button.elementIndex === undefined || !finitePositive(button.frame?.height)) continue
    mergedTargetHeights.set(
      button.elementIndex,
      Math.max(mergedTargetHeights.get(button.elementIndex) ?? 0, button.frame.height),
    )
  }
  for (const button of ax.buttonsAfter ?? []) {
    if (!targetIds.has(button.elementIndex) || !finitePositive(button.frame?.height)) continue
    mergedTargetHeights.set(
      button.elementIndex,
      Math.max(mergedTargetHeights.get(button.elementIndex) ?? 0, button.frame.height),
    )
  }
  if (mergedTargetHeights.size < 10) {
    throw unavailable('target-samples-insufficient', `只有 ${mergedTargetHeights.size} 个可用的目标按钮样本`)
  }
  const medianTargetHeight = median([...mergedTargetHeights.values()])
  const targetButtonCssPx = medianTargetHeight / calibration.scale
  const targetButtonSizeOk = Math.abs(targetButtonCssPx - OFFICIAL_BUTTON_CSS_PX) <= BUTTON_CSS_TOLERANCE
  const expectedButtonAxPx = OFFICIAL_BUTTON_CSS_PX * calibration.scale
  const crushed = buttons.filter((button) => button.frame.height / expectedButtonAxPx < CRUSH_RATIO_MAX)
  const headings = ax.headings ?? []
  const panelCss = ax.panel.width / calibration.scale
  const windowCss = ax.window.width / calibration.scale
  const targetPanelCss = Math.min(TARGET_PANEL_CSS_PX, windowCss - 48)
  const officialPanelCss = Math.min(OFFICIAL_PANEL_CSS_PX, windowCss - 48)
  const targetLower = targetPanelCss * (1 - PANEL_CSS_TOLERANCE_RATIO)
  const officialUpper = officialPanelCss * (1 + PANEL_CSS_TOLERANCE_RATIO)
  if (!finitePositive(targetPanelCss) || targetLower <= officialUpper) {
    throw unavailable(
      'panel-width-no-separation',
      `当前视口 ${windowCss.toFixed(1)} CSS px 下 target=${targetPanelCss.toFixed(1)} 与 official=${officialPanelCss.toFixed(1)} 容差带重叠`,
    )
  }

  // ── L1：导航是否**用户可滚** ────────────────────────────────────────────────
  // 两条独立读数，缺一不可：
  // ① AXScrollToVisible 只滚了导航、**右侧内容区没动** —— 基线里两者一起动
  //    （滚的是 panel 的 overflow:hidden，那只有程序滚得动）。**这条是判别器**。
  // ② 滚到底之后**末项拿到全高** —— 这是用户真正要的那个结果：
  //    「18 项里最后几项点得到」。基线里末两项恒为 0.83 CSS px。
  // **「AXScrollToVisible 调用成功」不是判据**：基线里它同样成功。这条判据曾经
  // 按那个写法起草，被基线读数字证伪后改掉。
  // **「AX 里出现滚动区域（AXScrollArea）」更不是判据**：射程为零，已整段删除并
  // 登记进 scripts/gates/dead-instruments.json（原因见 AX_PROGRAM 里那段说明）。
  const optBefore = ax.optionsYBefore ?? null
  const optAfter = ax.optionsYAfter ?? null
  const optionsMoved =
    optBefore !== null && optAfter !== null && Math.abs(optAfter - optBefore) > 0.5
  const railScrolled =
    ax.railFirstYBefore !== null && ax.railFirstYAfter !== null &&
    Math.abs(ax.railFirstYAfter - ax.railFirstYBefore) > 0.5
  const railIndependent = railScrolled && !optionsMoved

  const lastAfter = ax.railLastHeightAfter ?? null
  const lastRatio = finitePositive(lastAfter) ? lastAfter / expectedButtonAxPx : null
  const lastReachable = lastRatio !== null && lastRatio >= REACHABLE_RATIO_MIN

  const btnsAfter = ax.buttonsAfter ?? []
  // ⚠️ 「矮的项」**两次都没能当判据用**，别再试第三次：
  //   ① 静止时视口外的项矮 —— 滚动容器的正常读数（基线里那两项是**永久**矮）；
  //   ② 滚到底后**上方**的项也矮（实测 4 项各 0.83 CSS px，正是被裁剩的那条边）——
  //      任何滚动位置都会在两端裁掉东西，这不区分「修好」与「没修好」。
  // 真正能区分的是「**目标项**（末项）滚到底后拿不拿得到全高」，那由 lastReachable 判。
  // 这两个集合只作留痕：它们解释「为什么这一屏看起来是这样」，不参与判决。
  const crushedAfterScroll = btnsAfter.filter(
    (button) => button.frame.height / expectedButtonAxPx < CRUSH_RATIO_MAX,
  )

  const l1Ok = railIndependent && lastReachable
  const l2Ok = Math.abs(panelCss - targetPanelCss) <= targetPanelCss * PANEL_CSS_TOLERANCE_RATIO

  return {
    navCount: buttons.length,
    medianButtonCssPx: Number(targetButtonCssPx.toFixed(2)),
    targetButtonSizeOk,
    zoom: Number(calibration.scale.toFixed(4)),
    calibration,
    // ⚠️ 静止时「矮」**不是**缺陷读数：nav 一旦成为滚动容器，视口外的项本来就会
    // 报 0 高（被自己裁）。基线里那两项是**永久** 0.83 CSS px，区别在滚到底之后
    // 拿不拿得到全高 —— 那由 lastReachable 判。这里只作留痕。
    clippedAtRest: crushed.map((b) => ({
      label: b.label,
      cssPx: Number((b.frame.height / calibration.scale).toFixed(2)),
    })),
    headings,
    panelCssPx: Number(panelCss.toFixed(1)),
    targetPanelCssPx: Number(targetPanelCss.toFixed(1)),
    officialPanelCssPx: Number(officialPanelCss.toFixed(1)),
    navCssPx: Number((ax.nav.height / calibration.scale).toFixed(1)),
    railScrolled,
    optionsMoved,
    railIndependent,
    lastRailCssPx: lastAfter === null ? null : Number((lastAfter / calibration.scale).toFixed(2)),
    lastReachable,
    // 读数，非判据（见上面的说明：两次都没能区分两个状态）
    crushedAfterScroll: crushedAfterScroll.map((b) => ({
      label: b.label,
      cssPx: Number((b.frame.height / calibration.scale).toFixed(2)),
    })),
    pluginLoaded: headings.length >= 2,
    l1Ok,
    l2Ok,
  }
}

/**
 * 判据射程自检：**把已知状态的读数喂进 `judge()`，看它认不认得出**。
 *
 * 为什么必须有这一段：本探针至今写错过**四条**判据，全是「射程为零」——
 * 无论修好没修好都返回同一个值，于是要么永远绿，要么永远红：
 *
 * 1. `curl /plugins/.../client.js` 拿 404 当「实例里没有这个包」——该 HTTP 面整体
 *    401 守卫，对照一个已知能用的包同样 404。
 * 2. 「`AXScrollToVisible` 调用成功」——基线里它同样成功。
 * 3. 「AX 里出现 AXScrollArea」——nav 落成 `AXLandmarkNavigation`，Chromium 每节点
 *    只给一个 role，恒为 0。
 * 4. 目标按钮同时充当 scale 锚与验收对象——`button/(button/40)` 恒等于 40。
 *
 * 四次的共同点是：**判据写了，但没有独立证据，也没人拿它去跑一个「应该判红」的状态**。这段自检
 * 把这件事变成机制：每个判据至少要有**一对**读数（该绿的 + 该红的），少一对就报错。
 * 它跑的是纯函数 `judge()`，不碰 GUI、不需要重启、不需要应用在跑。
 */
function selfTest() {
  const base = (over = {}, scale = 1.2) => {
    const panel = { x: 120 * scale, y: 60 * scale, width: 960 * scale, height: 700 * scale }
    const nav = { x: panel.x, y: panel.y, width: OFFICIAL_NAV_CSS_PX * scale, height: panel.height }
    const closeFrame = {
      x: panel.x + panel.width - 42 * scale,
      y: panel.y + 14 * scale,
      width: OFFICIAL_CLOSE_CSS_PX * scale,
      height: OFFICIAL_CLOSE_CSS_PX * scale,
    }
    const buttons = Array.from({ length: 18 }, (_, index) => ({
      label: `n${index}`,
      elementIndex: 100 + index,
      frame: {
        x: nav.x + 12 * scale,
        y: nav.y + (70 + index * 44) * scale,
        width: 164 * scale,
        height: OFFICIAL_BUTTON_CSS_PX * scale,
      },
    }))
    return {
      errors: [],
      window: { x: 0, y: 0, width: 1316 * scale, height: 800 * scale },
      axNodeCount: 1400,
      panelCandidateCount: 1,
      navCandidateCount: 1,
      closeCandidateCount: 1,
      panel,
      nav,
      closeAnchor: { elementIndex: 11, title: 'Close', frame: closeFrame },
      calibrationAnchors: [
        { id: 'settings-nav-width', elementIndex: 10, observedAxPx: nav.width, expectedCssPx: OFFICIAL_NAV_CSS_PX },
        { id: 'settings-close-width', elementIndex: 11, observedAxPx: closeFrame.width, expectedCssPx: OFFICIAL_CLOSE_CSS_PX },
        { id: 'settings-close-height', elementIndex: 11, observedAxPx: closeFrame.height, expectedCssPx: OFFICIAL_CLOSE_CSS_PX },
      ],
      buttons,
      headings: [...GROUP_TITLES],
      optionsYBefore: 508 * scale,
      optionsYAfter: 508 * scale,
      railFirstYBefore: 225 * scale,
      railFirstYAfter: 118 * scale,
      railLastHeightAfter: OFFICIAL_BUTTON_CSS_PX * scale,
      buttonsAfter: [],
      ...over,
    }
  }

  const at15 = base({}, 1.5)
  const tallButtons = base()
  tallButtons.buttons = tallButtons.buttons.map((button) => ({
    ...button,
    frame: { ...button.frame, height: 60 },
  }))
  tallButtons.railLastHeightAfter = 60
  const conflict = base()
  conflict.calibrationAnchors = conflict.calibrationAnchors.map((anchor) =>
    anchor.id === 'settings-nav-width' ? { ...anchor, observedAxPx: OFFICIAL_NAV_CSS_PX * 1.5 } : anchor)
  const missingClose = base({ closeCandidateCount: 0, closeAnchor: null, calibrationAnchors: [] })
  const nonPositive = base()
  nonPositive.calibrationAnchors = nonPositive.calibrationAnchors.map((anchor, index) =>
    index === 0 ? { ...anchor, observedAxPx: 0 } : anchor)

  const withPanelWidth = (ax, widthCss, xCss = ax.panel.x / (ax.nav.width / OFFICIAL_NAV_CSS_PX)) => {
    const scale = ax.nav.width / OFFICIAL_NAV_CSS_PX
    const panel = { ...ax.panel, x: xCss * scale, width: widthCss * scale }
    const nav = { ...ax.nav, x: panel.x }
    const closeFrame = {
      ...ax.closeAnchor.frame,
      x: panel.x + panel.width - 42 * scale,
    }
    return {
      ...ax,
      panel,
      nav,
      closeAnchor: { ...ax.closeAnchor, frame: closeFrame },
    }
  }
  const official = withPanelWidth(base(), OFFICIAL_PANEL_CSS_PX)
  official.headings = []
  official.railFirstYAfter = official.railFirstYBefore
  official.railLastHeightAfter = 1
  const narrow = withPanelWidth(
    base({ window: { x: 0, y: 0, width: 900 * 1.2, height: 800 * 1.2 } }),
    900 - 48,
    24,
  )

  const cases = [
    { name: '生效（独立校准 1.2）', ax: base(), want: { pluginLoaded: true, targetButtonSizeOk: true, l1Ok: true, l2Ok: true } },
    { name: '合法整体 zoom 1.5', ax: at15, want: { targetButtonSizeOk: true, l1Ok: true, l2Ok: true } },
    { name: '目标按钮变高但校准锚不变', ax: tallButtons, want: { targetButtonSizeOk: false } },
    { name: '未生效（无标题、官方 800、导轨不独立滚）', ax: official, want: { pluginLoaded: false, l1Ok: false, l2Ok: false } },
    { name: 'nav 滚动时右侧内容也跟着动', ax: base({ optionsYAfter: 615 * 1.2 }), want: { l1Ok: false } },
    { name: '末项滚到底仍拿不到全高', ax: base({ railLastHeightAfter: 1 }), want: { l1Ok: false } },
    { name: '面板仍是官方 800', ax: withPanelWidth(base(), OFFICIAL_PANEL_CSS_PX), want: { l2Ok: false } },
    { name: 'close 校准锚缺失', ax: missingClose, wantUnavailable: 'close-candidate-missing' },
    { name: 'nav/close scale 冲突', ax: conflict, wantUnavailable: 'calibration-anchor-conflict' },
    { name: '校准锚为零', ax: nonPositive, wantUnavailable: 'calibration-non-positive' },
    { name: 'panel 不在所选 window', ax: base({ window: { x: 0, y: 0, width: 1000, height: 700 } }), wantUnavailable: 'window-panel-mismatch' },
    { name: '窄视口下官方档与目标档无可分射程', ax: narrow, wantUnavailable: 'panel-width-no-separation' },
    { name: 'Accessibility permission denied', ax: base({ errors: ['accessibility-permission-denied'] }), wantUnavailable: 'accessibility-permission-denied' },
    { name: 'instrument timeout', ax: base({ errors: ['instrument-timeout'] }), wantUnavailable: 'instrument-timeout' },
  ]

  const problems = []
  let assertions = 0
  for (const testCase of cases) {
    try {
      const verdict = judge(testCase.ax)
      if (testCase.wantUnavailable !== undefined) {
        problems.push(`「${testCase.name}」应 typed unavailable(${testCase.wantUnavailable})，却给出了判决`)
        continue
      }
      for (const [key, want] of Object.entries(testCase.want)) {
        assertions += 1
        if (verdict[key] !== want) {
          problems.push(`「${testCase.name}」判据 ${key}：期望 ${want}，实得 ${verdict[key]} —— 该判据没有射程`)
        }
      }
    } catch (error) {
      if (testCase.wantUnavailable !== undefined && error instanceof ProbeUnavailableError) {
        assertions += 1
        if (error.code !== testCase.wantUnavailable) {
          problems.push(`「${testCase.name}」期望 typed unavailable=${testCase.wantUnavailable}，实得 ${error.code}`)
        }
      } else {
        problems.push(`「${testCase.name}」judge() 异常：${error.message}`)
      }
    }
  }

  // —— 「设置入口」可访问名规则的反向自检（2026-09-18 加的，因为这条规则刚红过一次）——
  // 旧写法只认 `AXTitle`，于是设置页**没开着**时（最常见的状态）判 hasTrigger=false，
  // 探针把「窗口在屏上、树可读」报成「窗口拉不到前台」。每个夹具都是一个真实形态。
  const triggerFixtures = [
    { name: '名字在 title 上（旧形态）', node: { role: 'AXPopUpButton', title: '设置' }, want: true },
    { name: '名字在 description 上（2026-09-18 实测形态）', node: { role: 'AXPopUpButton', description: '设置' }, want: true },
    { name: 'AXButton + description', node: { role: 'AXButton', description: '设置' }, want: true },
    { name: '两侧都没有名字', node: { role: 'AXPopUpButton' }, want: false },
    { name: '角色不对（静态文本）', node: { role: 'AXStaticText', description: '设置' }, want: false },
    { name: '只是前缀相同（设置与更新）', node: { role: 'AXPopUpButton', description: '设置与更新' }, want: false },
    { name: '名字是别的项（外观）', node: { role: 'AXPopUpButton', description: '外观' }, want: false },
    { name: '只有空白不算名字', node: { role: 'AXPopUpButton', description: '   ' }, want: false },
  ]
  for (const fixture of triggerFixtures) {
    assertions += 1
    const got = isSettingsTrigger(fixture.node)
    if (got !== fixture.want) {
      problems.push(`设置入口规则「${fixture.name}」期望 ${fixture.want}、实得 ${got} —— 规则没有射程`)
    }
  }
  // 生成物必须与 JS 求值器同源：漏认一个名字字段，等于把「上游此刻把名字放哪个字段」
  // 当成了契约。这条同时钉住「改规则只能改常量」。
  const predicate = pyTriggerPredicate()
  for (const field of SETTINGS_TRIGGER_NAME_FIELDS) {
    assertions += 1
    if (!predicate.includes(`.get("${field}")`)) {
      problems.push(`实况程序没有覆盖名字字段 ${field} —— 该字段上的名字会被漏判（两侧规则不同源）`)
    }
  }
  for (const role of SETTINGS_TRIGGER_ROLES) {
    assertions += 1
    if (!predicate.includes(`"${role}"`)) {
      problems.push(`实况程序没有覆盖角色 ${role} —— 该角色上的入口会被漏判（两侧规则不同源）`)
    }
  }

  assertions += 6
  if (unavailableExitCode(false) !== 2) problems.push('普通模式下 typed unavailable 必须是 exit 2')
  if (unavailableExitCode(true) !== 1) problems.push('--require-no-skip 必须把 typed unavailable 升为 exit 1')
  const skipReport = typedUnavailableReport(unavailable('instrument-timeout', 'synthetic timeout'))
  if (skipReport.status !== 'unavailable') problems.push('typed unavailable 报告必须明确 status=unavailable')
  if (skipReport.verdict !== null) problems.push('typed unavailable 报告不得携带判决')
  if (skipReport.typedSkips[0]?.type !== 'instrument-timeout') problems.push('typed unavailable 报告必须保留稳定 code')
  if (skipReport.typedSkips[0]?.count !== 1) problems.push('typed unavailable 报告必须满足 count 守恒')

  if (problems.length > 0) {
    console.error('✗ 判据射程自检未通过：')
    for (const problem of problems) console.error(`  ✗ ${problem}`)
    return 1
  }
  console.log(`✓ 判据射程自检：${cases.length} 个状态、${assertions} 条断言，全部按预期红/绿/typed skip。`)
  console.log('  （覆盖：独立校准 / target size / plugin loaded / L1 / L2 / 锚缺失与冲突 / 错窗 / permission / timeout / 设置入口可访问名）')
  return 0
}

async function main() {
  assertNodeUsable()

  const argv = process.argv.slice(2)
  if (argv.includes('--self-test')) return selfTest()
  const outIdx = argv.indexOf('--out')
  const outDir = outIdx >= 0 ? argv[outIdx + 1] : null
  if (outIdx >= 0 && !outDir) throw unavailable('output-dir-missing', '--out 后必须提供报告目录')

  const loadpoint = checkLoadpoint()
  const harnessBin = await preflight()
  const ax = await readAxis(harnessBin)
  const verdict = judge(ax)

  const report = {
    at: new Date().toISOString(),
    status: 'decided',
    loadpoint,
    raw: ax,
    verdict,
    typedSkips: [],
    failures,
    notes,
  }

  if (outDir) {
    mkdirSync(outDir, { recursive: true })
    const p = join(outDir, 'settings-shell-live.json')
    writeFileSync(p, JSON.stringify(report, null, 2) + '\n')
    console.log(`报告：${p}`)
  }

  console.log(`窗口 ${ax.window.width}x${ax.window.height} AX px · 独立校准 scale=${verdict.zoom}`)
  for (const anchor of verdict.calibration.anchors) {
    console.log(
      `校准锚 ${anchor.id}#${anchor.elementIndex}: raw=${anchor.observedAxPx} AX px` +
        ` / expected=${anchor.expectedCssPx} CSS px / sampleScale=${anchor.sampleScale}` +
        ` / residual=${anchor.residualAxPx}<=${anchor.toleranceAxPx} AX px`,
    )
  }
  console.log(`目标导航按钮 ${verdict.medianButtonCssPx} CSS px（期望 ${OFFICIAL_BUTTON_CSS_PX}±${BUTTON_CSS_TOLERANCE}）`)
  console.log(`导航项 ${verdict.navCount} 个 · 导航容器 ${verdict.navCssPx} CSS px · 面板 ${verdict.panelCssPx} CSS px`)
  console.log(
    `导航独立滚动=${verdict.railIndependent}（导轨动了=${verdict.railScrolled} 内容区也动了=${verdict.optionsMoved}）` +
      ` · 滚到底末项 ${verdict.lastRailCssPx} CSS px（全高=${verdict.lastReachable}）`,
  )
  console.log(`装载点 sha=${loadpoint.sha} · bundles 登记=${loadpoint.inBundles} · 设置页已关闭=${ax.closed}（探针开启=${!ax.dialogWasOpen}）`)

  if (failures.length > 0) {
    console.error('\n装载点判据未通过（与实例是否重启无关）：')
    for (const f of failures) console.error(`  ✗ ${f}`)
    return 1
  }

  if (!verdict.pluginLoaded) {
    console.log('\n判决：**未生效** —— 左栏没有本包注入的分组标题。')
    console.log(`  静止时视口外 ${verdict.clippedAtRest.length} 项（${verdict.clippedAtRest.map((c) => c.label).join(' / ') || '无'}），面板 ${verdict.panelCssPx} CSS px（官方 ${OFFICIAL_PANEL_CSS_PX}）。`)
    console.log('  这是「实例早于本包」的正常读数，不是失败：')
    console.log('  生效路径 = 构建 -> sync-profile --apply --loadpoint -> **重启应用** -> 重跑本探针。')
    console.log('  （刷新页面不是生效路径，见 P-15 / ADR-0078。）')
    return 3
  }

  const bad = []
  if (!verdict.targetButtonSizeOk) {
    bad.push(
      `目标导航按钮 ${verdict.medianButtonCssPx} CSS px，超出 ` +
        `${OFFICIAL_BUTTON_CSS_PX}±${BUTTON_CSS_TOLERANCE} CSS px`,
    )
  }
  if (!verdict.l1Ok) {
    const why = []
    if (verdict.optionsMoved) {
      why.push('导轨与右侧内容区**一起**动了 —— 滚的是 panel 的 overflow:hidden，那是程序滚、用户滚不动')
    } else if (!verdict.railScrolled) {
      why.push('导轨根本没动 —— AXScrollToVisible 没能把末项带进视野')
    }
    if (!verdict.lastReachable) {
      why.push(
        `滚到底后末项只有 ${verdict.lastRailCssPx} CSS px（目标全高 ${OFFICIAL_BUTTON_CSS_PX}，` +
          `要求 >= ${(OFFICIAL_BUTTON_CSS_PX * REACHABLE_RATIO_MIN).toFixed(1)}）`,
      )
    }
    if (verdict.crushedAfterScroll.length > 0) {
      why.push(
        `滚到底后矮的项：${verdict.crushedAfterScroll.map((c) => `${c.label}(${c.cssPx})`).join(' ')}` +
          '（多数是滚到上方视口外的，仅供定位，本身不算缺陷）',
      )
    }
    bad.push(`L1：导航不是用户可滚的（${why.join('；')}）`)
  }
  if (!verdict.l2Ok) {
    bad.push(
      `L2：面板 ${verdict.panelCssPx} CSS px，目标 ${verdict.targetPanelCssPx} CSS px` +
        `（官方对照 ${verdict.officialPanelCssPx}）`,
    )
  }
  if (verdict.headings.length < GROUP_TITLES.length) bad.push(`L2：只数到 ${verdict.headings.length}/${GROUP_TITLES.length} 个分组标题（${verdict.headings.join(' ')}）`)

  if (bad.length > 0) {
    console.error('\n已生效但判据未达标：')
    for (const b of bad) console.error(`  ✗ ${b}`)
    return 1
  }

  console.log(`\n✓ 已生效：分组标题 ${verdict.headings.length}/${GROUP_TITLES.length}（${verdict.headings.join(' ')}）`)
  console.log(
      `✓ L1：导航独立可滚（导轨动了=${verdict.railScrolled}、内容区没动=${!verdict.optionsMoved}；` +
      `滚到底末项 ${verdict.lastRailCssPx} CSS px = 目标全高的 ${(verdict.lastRailCssPx / OFFICIAL_BUTTON_CSS_PX).toFixed(2)}）`,
  )
  console.log(`✓ L2：面板 ${verdict.panelCssPx} CSS px（本视口目标 ${verdict.targetPanelCssPx}；官方对照 ${verdict.officialPanelCssPx}）`)
  return 0
}

main().then(
  (code) => process.exit(code),
  (err) => {
    const argv = process.argv.slice(2)
    const outIdx = argv.indexOf('--out')
    const outDir = outIdx >= 0 ? argv[outIdx + 1] : null
    if (!(err instanceof ProbeUnavailableError)) {
      console.error(`\n✗ 探针自身异常：${err.stack ?? err.message}`)
      process.exit(1)
    }

    const report = typedUnavailableReport(err)
    if (outDir) {
      mkdirSync(outDir, { recursive: true })
      const path = join(outDir, 'settings-shell-live.json')
      writeFileSync(path, JSON.stringify(report, null, 2) + '\n')
      console.error(`报告：${path}`)
    }
    const requireNoSkip = argv.includes('--require-no-skip')
    console.error(`\n△ typed unavailable [${err.code}]：${err.message}`)
    console.error(
      requireNoSkip
        ? '  strict 模式：typed unavailable 升为 exit 1，本探针没有产出判决。'
        : '  exit 2：前置条件或仪器不可用，本探针没有产出判决。',
    )
    process.exit(unavailableExitCode(requireNoSkip))
  },
)
