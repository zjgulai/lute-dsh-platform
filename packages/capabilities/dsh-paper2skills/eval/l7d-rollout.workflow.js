/**
 * F7（F6-v2）契约层实测 · 生成批（workflow 工具用的脚本体，留档以便复跑）
 *
 * 四臂（与 eval/out/l7d/cases.json 的 meta.arms 逐字一致）：
 *   control  只有任务
 *   treat    任务 + 卡全文
 *   v1       任务 + 卡全文 + 契约（模板 v1，与 F6 同形）
 *   v2       任务 + 卡全文 + 契约（模板 v2，加与禁令对称的正面义务）
 *
 * 为什么要加 v1 臂：F6 的负结果是在**另外 5 张卡**上测出来的。只跑 v2 vs control，
 * 万一 v2 变好，无法排除「这批卡本来就不同」（F6 里单卡臂在新卡上是 +1.6，方向与原实验相反）。
 * 同卡同题跑 v1，才让「v2 修好了没有」成为一个**配对**问题。
 *
 * 留出性：4 张卡与 8 道题从未被读过（build-l7d-cases.mjs 自证）；契约由没见过任何题面的撰写人生成；
 * 判分盲配对。抽样框在跑批前后各校验一次（build-l7d-cases.mjs --verify-frame）。
 *
 * 传参：args.cases = [{case_id, card, card_path, role, tasks:{train,holdout},
 *                      contract_v1_path, contract_v2_path}]
 */
const CASES = args.cases
const ARMS = ['control', 'treat', 'v1', 'v2']
const OUT = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills/eval/out/l7d/rollout'

function buildPrompt(c, split, arm) {
  const taskPath = c.tasks[split]
  const out = `${OUT}/${c.case_id}-${split}-${arm}.md`
  let p = `你是一位母婴出海跨境电商公司的岗位分身（本岗位：${c.role}）。下面有一位经营者来求助。

【第一步：读题】
读文件 ${taskPath}，文件里那一段话就是经营者的原话。**只读这个文件**。

【第二步：交付】
产出一份**可直接执行的方案**（Markdown），用写文件工具写到：
${out}

要求：
· 直接给方案，不要复述请求，不要写「根据您的要求」这类开场。
· 400–800 字。
· 必须有明确的判定规则、数量口径、动作与停止条件，让人拿着就能干活。
· 正文不要出现「本资料 / 该技能 / 这张卡」这类元话语。
· 写完后只回报：文件路径 + 字数。**不要在回复里粘贴正文。**
`
  if (arm !== 'control') {
    p += `
【第三步：资料】
读这份资料全文：${c.card_path}
它是一张算法技能卡。**据此产出方案。**
`
  }
  if (arm === 'v1' || arm === 'v2') {
    p += `
【第四步：本岗位的供给契约】
读这份契约全文：${arm === 'v1' ? c.contract_v1_path : c.contract_v2_path}
契约规定这张卡的方法在本业务该怎么标定。
**按契约产出方案。**
`
  }
  return p
}

phase('生成')
log(`四臂 × ${CASES.length} 用例 × {train, holdout} = ${CASES.length * 2 * ARMS.length} 份交付物`)

const jobs = []
for (const c of CASES) {
  for (const split of ['train', 'holdout']) {
    for (const arm of ARMS) {
      jobs.push(() => agent(buildPrompt(c, split, arm), {
        label: `${c.case_id}-${split}-${arm}`, phase: '生成',
      }))
    }
  }
}
const results = await parallel(jobs)
const ok = results.filter(Boolean).length
log(`完成 ${ok}/${jobs.length}`)
return { total: jobs.length, ok, failed: jobs.length - ok }
