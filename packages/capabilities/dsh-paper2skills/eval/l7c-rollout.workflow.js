/**
 * F6 契约层实测 · 生成批（workflow 工具用的脚本体，留档以便复跑）
 *
 * 为什么要把脚本存进仓库：原 L7 实验的 workflow 脚本没有落盘，
 * 于是今天既复现不出当时的判官 prompt，也复现不出当时的出题口径 ——
 * 「实验没留脚本」等于「结论只有作者知道」。本次一并存下。
 *
 * 三臂定义（与 eval-report.md §3.1 一致，只多一个契约臂）：
 *   control  只有任务
 *   treat    任务 + 卡全文（"据此产出方案"）—— 原实验里吃负结果的那一臂
 *   contract 任务 + 卡全文 + 该责任的供给契约（"按契约产出方案"）
 *
 * 留出性：本批 10 道题与 5 张卡**从未被读过**（eval/build-f6-cases.mjs 自证），
 * 契约由没见过任何题面的撰写人生成，判分盲配对。
 *
 * 传参：args.cases = [{case_id, card, card_path, contract_path, role, tasks:{train,holdout}}]
 */
const CASES = args.cases
const ARMS = ['control', 'treat', 'contract']
const OUT = '/Users/lute/project/Magpie-Horch/packages/capabilities/dsh-paper2skills/eval/out/l7c/rollout'

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
  if (arm === 'contract') {
    p += `
【第四步：本岗位的供给契约】
读这份契约全文：${c.contract_path}
契约规定这张卡的方法在本业务该怎么标定。
**按契约产出方案。**
`
  }
  return p
}

phase('生成')
log(`三臂 × ${CASES.length} 用例 × {train, holdout} = ${CASES.length * 2 * ARMS.length} 份交付物`)

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
