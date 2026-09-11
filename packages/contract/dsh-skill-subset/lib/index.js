import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * dsh-skill-subset — 供 agent preset 使用的技能子集打包插件（host-only）。
 * 1) 正向：把 config.skills 指定的技能以「运行时技能」在 preset scope 层重注册（modelInvocable: true），
 *    同名遮蔽全局的 model-off 副本（O1 默认策略）。
 *    respectFileFlags: true 时启用严格语义（I3 立项）：modelInvocable = 文件 disable-model-invocation 取反、
 *    userInvocable = 文件 user-invocable 不为 false —— 设置页开关在 preset 会话内同样生效。
 * 2) 负向（hideOthers，默认开）：把目录中其余全部技能注册为
 *    { modelInvocable: false, userInvocable: false } 遮蔽 → 该 preset 的模型目录与 "/" 菜单只显示子集。
 * 内容直读 ~/.dsh/skills/<name>/SKILL.md；注册随 preset scope 生命周期自动撤销。
 */
/**
 * @typedef {object} SkillFile
 * @property {string} name 技能名（来自 frontmatter 的 name 字段）
 * @property {string} title 技能标题，缺省为空串
 * @property {string} description 技能描述，缺省为空串
 * @property {string} content 正文（frontmatter 之后的全部内容）
 * @property {boolean} disableModel frontmatter 的 disable-model-invocation 是否为 true
 * @property {boolean} userInvocable frontmatter 的 user-invocable 是否为 true（缺省 true）
 */

/**
 * @typedef {object} SubsetConfig
 * @property {string[]} [skills] 需要在本 preset 内可见的技能名列表
 * @property {boolean} [hideOthers] 是否遮蔽子集外的技能，缺省 true
 * @property {"dir"|"none"} [positiveSource] 正向注册来源，缺省 "dir"
 * @property {boolean} [respectFileFlags] 是否尊重技能文件的调用开关，缺省 false
 * @property {string} [skillsDir] 技能根目录，缺省 ~/.dsh/skills
 */

/**
 * Cordis 插件上下文（本包只使用其中三项能力）。
 * @typedef {object} PluginContext
 * @property {{ register: (skill: Record<string, unknown>) => unknown, list: () => Promise<unknown> }} skills
 * @property {{ warn?: (message: string) => void }} [logger]
 * @property {(fn: () => Promise<void>, label?: string) => unknown} effect
 */

const name = "dsh-skill-subset";
const inject = ["skills"];

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKILLS_DIR = join(homedir(), ".dsh", "skills");

/**
 * 去掉 frontmatter 值两侧的引号。
 * @param {string} value 原始值
 * @returns {string} 去引号后的值
 */
function unquote(value) {
  let v = String(value);
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v.replace(/\\"/g, '"');
}

/**
 * 解析 SKILL.md 的 frontmatter 与正文。
 * @param {string} text SKILL.md 全文
 * @returns {SkillFile | null} 无有效 frontmatter 时返回 null
 */
function parseSkillFile(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return null;
  const fm = m[1] ?? "";
  const body = m[2] ?? "";
  const descLine = /^description:\s*(.+)\s*$/m.exec(fm);
  const titleLine = /^title:\s*(.+)\s*$/m.exec(fm);
  const nameLine = /^name:\s*(.+)\s*$/m.exec(fm);
  const disLine = /^disable-model-invocation:\s*(true|false)\s*$/m.exec(fm);
  const usrLine = /^user-invocable:\s*(true|false)\s*$/m.exec(fm);
  const description = unquote(descLine?.[1] ?? "");
  const title = unquote(titleLine?.[1] ?? "");
  const skillName = unquote(nameLine?.[1] ?? "");
  return {
    name: skillName, title, description, content: body.trimStart(),
    disableModel: disLine ? disLine[1] === "true" : false,
    userInvocable: usrLine ? usrLine[1] === "true" : true,
  };
}

/**
 * 从 catch 变量中取出可读消息。
 * @param {unknown} error 捕获到的错误
 * @returns {string} 消息文本，非 Error 时回退为字符串化结果
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 挂载技能子集插件。
 * @param {PluginContext} ctx Cordis 上下文
 * @param {SubsetConfig} [config] 插件配置
 * @returns {void}
 */
export function apply(ctx, config = {}) {
  const list = Array.isArray(config.skills) ? config.skills : [];
  const hideOthers = config.hideOthers !== false;
  // positiveSource: "dir"（默认，读 skillsDir 正注册）| "none"（自有 filesystem 行已正注册，本行只做负向遮蔽）
  const positiveSource = config.positiveSource === "none" ? "none" : "dir";
  // I3 严格语义（默认 false = 现状：子集内全部可调用；true = 尊重文件开关）
  const respectFileFlags = config.respectFileFlags === true;
  const skillsDir = typeof config.skillsDir === "string" && config.skillsDir !== "" ? config.skillsDir : SKILLS_DIR;
  const invalid = list.filter((n) => typeof n !== "string" || !NAME_PATTERN.test(n));
  if (invalid.length > 0) throw new Error(`dsh-skill-subset: invalid skill names in config: ${invalid.join(", ")}`);
  ctx.effect(async () => {
    // 先取合并目录（此时尚未注册任何遮蔽 → 拿到完整可见目录；不带 scope 参数，按调用方作用域合并）
    let catalog = [];
    try {
      const result = await ctx.skills.list();
      catalog = Array.isArray(result) ? result : [];
    } catch (error) {
      ctx.logger?.warn?.(`dsh-skill-subset: list() 失败: ${errorMessage(error)}`);
    }
    const wanted = new Set(list);

    // 正向注册子集（positiveSource !== "none" 时）
    if (positiveSource === "dir") for (const skillName of list) {
      try {
        const text = await readFile(join(skillsDir, skillName, "SKILL.md"), "utf8");
        const parsed = parseSkillFile(text);
        if (!parsed) {
          ctx.logger?.warn?.(`dsh-skill-subset: ${skillName} 无有效 frontmatter，跳过`);
          continue;
        }
        ctx.skills.register({
          name: parsed.name,
          ...(parsed.title ? { title: parsed.title } : {}),
          description: parsed.description,
          content: parsed.content,
          invocation: {
            modelInvocable: respectFileFlags ? !parsed.disableModel : true,
            userInvocable: respectFileFlags ? parsed.userInvocable !== false : true,
          },
          metadata: { subsetSource: "dsh-skill-subset" }
        });
      } catch (error) {
        ctx.logger?.warn?.(`dsh-skill-subset: ${skillName} 注册失败: ${errorMessage(error)}`);
      }
    }

    // 负向遮蔽：目录中其余全部技能 → 本 preset 内不可见。
    // 名单 = 目录枚举（user-dsh 全集，不依赖 list() 完整性）∪ catalog（shipped/运行时等）。
    if (hideOthers) {
      const shadowed = new Set();
      for (const skill of catalog) {
        if (!wanted.has(skill.name)) shadowed.add(skill.name);
      }
      try {
        const dirs = await readdir(skillsDir, { withFileTypes: true });
        for (const d of dirs) {
          if (!d.isDirectory() || !NAME_PATTERN.test(d.name) || wanted.has(d.name)) continue;
          shadowed.add(d.name);
        }
      } catch (error) {
        ctx.logger?.warn?.(`dsh-skill-subset: 目录枚举失败: ${errorMessage(error)}`);
      }
      for (const skillName of shadowed) {
        try {
          ctx.skills.register({
            name: skillName,
            description: "（本预设未启用）",
            content: "",
            invocation: { modelInvocable: false, userInvocable: false },
            metadata: { subsetSource: "dsh-skill-subset", hidden: true }
          });
        } catch (error) {
          ctx.logger?.warn?.(`dsh-skill-subset: 遮蔽 ${skillName} 失败: ${errorMessage(error)}`);
        }
      }
    }
  }, "dsh-skill-subset: register subset");
}

export { name, inject };
