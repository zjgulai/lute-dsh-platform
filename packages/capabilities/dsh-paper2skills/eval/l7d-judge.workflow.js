/**
 * F7（F6-v2）契约层实测 · 判分批（workflow 工具用的脚本体，留档以便复跑）
 *
 * 盲配对：判分 agent 只看 `<pair>/X.md` 与 `<pair>/Y.md`，看不到臂名。
 *
 * 三维固定量表 —— 与 F6 **逐字一致**（同一把尺子，否则两轮的数字没法放在一起看）：
 *   completeness  交付物完整度：请求要办的事是否都被覆盖（含边界与例外）
 *   specificity   具体性：给的是可执行的判定规则 / 数量口径 / 动作与停止条件，还是停在原则与框架
 *   data_clarity  数据与口径明确：每个数字与口径是否说清取数来源与算法 ——
 *                 **两个方向都罚**：既罚把无来源的数字当既成事实，也罚该给口径时只写「待定」
 * 各 0–5 整数分。判官是 LLM，F6 实测噪声 ±0.6~0.7（满分 15）⇒ 判据用 Δ 的 95% 区间下界，不用均值过 0。
 *
 * ⚠️ v2 的修法是「缺口必须带处置」。判官**不知道**这件事，这里的量表也没加这一维 ——
 *    这是有意的：如果只有知情者才看得出好处，那好处就不存在。修法是否有效由盲判官与
 *    确定性诊断（analyze-l7d.mjs 的 D1–D3）分别判定，两条证据方向一致才算数。
 *
 * 传参：args.pairs = [{pair_id, dir}]
 */
const PAIRS = args.pairs

function buildPrompt(p) {
  return `你是一位严格的业务评审。下面有两份**针对同一个业务请求**的交付方案，记为 X 与 Y。

【第一步】只读这两个文件，别读别处，也不要猜测它们从哪来：
X：${p.dir}/X.md
Y：${p.dir}/Y.md

【第二步】按三个固定维度给 X 与 Y 各打一个 **0–5 的整数分**：
1. completeness（交付物完整度）：请求里要办的事是否都被覆盖，含边界与例外情形。
2. specificity（具体性）：给的是**可执行的**判定规则、数量口径、动作与停止条件，还是停在原则与框架。
3. data_clarity（数据与口径明确）：每个数字与口径是否说清了取数来源与计算方式。
   ⚠️ 这一维**两个方向都罚**：既罚「把没有来源的数字当成既成事实」，也罚「该给口径的地方只写『待定 / 需标定』」。

【第三步】把结果写到文件：${p.dir}/scores.json
格式必须严格如下（数字为整数，0–5）：
{"pair_id":"${p.pair_id}","x":{"completeness":0,"specificity":0,"data_clarity":0},"y":{"completeness":0,"specificity":0,"data_clarity":0},"note":"一句话说明 X 与 Y 各自最大的优劣（**不要提任何来源、臂名或资料名**）"}

【回报】只回报：文件路径 + X 的三维总分 + Y 的三维总分。**不要粘贴正文，不要评价哪一份「更好」之外的任何推断。**`
}

phase('判分')
log(`盲配对 ${PAIRS.length} 组`)
const results = await parallel(PAIRS.map((p) => () => agent(buildPrompt(p), {
  label: p.pair_id, phase: '判分',
})))
const ok = results.filter(Boolean).length
log(`完成 ${ok}/${PAIRS.length}`)
return { total: PAIRS.length, ok, failed: PAIRS.length - ok }
