import test from "node:test";
import assert from "node:assert/strict";
import { createOwnership, guardMemberRequest, filterMemberResponse, learnWorkspace, learnSession, ownerOfPath } from "../src/policy.mjs";
import { defaultConfig } from "../src/config.mjs";
import { createUser } from "../src/users.mjs";

function fixture() {
  const config = defaultConfig("/tmp/dsh-team-hub-test");
  createUser(config, { name: "admin", role: "admin", password: "admin-pass-1" });
  createUser(config, { name: "alice", role: "member", password: "alice-pass-1" });
  createUser(config, { name: "bob", role: "member", password: "bob-pass-123" });
  const ownership = createOwnership();
  learnWorkspace(config, ownership, { workspaceId: "wa", path: "/tmp/dsh-team-hub-test/workspaces/alice", sessionIds: ["sa"] });
  learnWorkspace(config, ownership, { workspaceId: "wb", path: "/tmp/dsh-team-hub-test/workspaces/bob", sessionIds: ["sb"] });
  return { config, ownership, alice: config.users[1], bob: config.users[2] };
}

test("member can list only own sessions（Desktop session/list 响应过滤）", () => {
  const { ownership, alice } = fixture();
  const value = filterMemberResponse({ ownership, user: alice, method: "session/list", value: {
    items: [{ sessionId: "sa" }, { sessionId: "sb" }, { sessionId: "admin-1" }]
  }});
  assert.deepEqual(value.items, [{ sessionId: "sa" }]);
});

test("member cannot use another member session（斜杠 + args 信封）", () => {
  const { config, ownership, alice } = fixture();
  const result = guardMemberRequest({ config, ownership, user: alice, method: "session/prompt", payload: { args: { request: { requestId: "r1", sessionId: "sb", mode: "queue", content: [] } } } });
  assert.equal(result.ok, false);
});

test("member can prompt own session（斜杠 + args 信封放行）", () => {
  const { config, ownership, alice } = fixture();
  const result = guardMemberRequest({ config, ownership, user: alice, method: "session/prompt", payload: { args: { request: { requestId: "r1", sessionId: "sa", mode: "queue", content: [] } } } });
  assert.equal(result.ok, true);
});

test("session/create 强制注入成员工作区（Desktop 不接受 cwd 同给）", () => {
  const { config, ownership, alice } = fixture();
  const result = guardMemberRequest({ config, ownership, user: alice, method: "session/create", payload: { args: { request: { agentPreset: "default" } } } });
  assert.equal(result.ok, true);
  assert.equal(result.args.request.workspaceId, "wa");
  assert.equal(result.args.request.cwd, undefined);
});

test("未知或特权方法拒绝（Desktop 斜杠命名）", () => {
  const { config, ownership, alice } = fixture();
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "credentials/set", payload: { args: {} } }).ok, false);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "workspace/create", payload: { args: {} } }).ok, false);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "future.method", payload: { args: {} } }).ok, false);
});

test("只读方法放行（settings/describe、llm/*、session/modelCatalog）", () => {
  const { config, ownership, alice } = fixture();
  for (const method of ["settings/describe", "llm/discoverModels", "llm/listProviders", "session/modelCatalog"]) {
    assert.equal(guardMemberRequest({ config, ownership, user: alice, method, payload: { args: {} } }).ok, true, method);
  }
});

test("胶囊卡只读三件套放行；invoke/resolveRequestRun 维持拒绝", () => {
  const { config, ownership, alice } = fixture();
  for (const method of ["pluginInventory/list", "dynamicCordisRunner/inventory", "dynamicCordisRunner/syncInspectManifest"]) {
    assert.equal(guardMemberRequest({ config, ownership, user: alice, method, payload: { args: {} } }).ok, true, method);
  }
  for (const method of ["dynamicCordisRunner/invoke", "dynamicCordisRunner/resolveRequestRun"]) {
    assert.equal(guardMemberRequest({ config, ownership, user: alice, method, payload: { args: {} } }).ok, false, method);
  }
});

test("预设面：agentPresets/list 放行，select 按 agentId 守卫，copy/deletePreset 拒绝", () => {
  const { config, ownership, alice } = fixture();
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "agentPresets/list", payload: { args: {} } }).ok, true);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "agentPresets/select", payload: { args: { agentId: "sa", agentPreset: "standard" } } }).ok, true);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "agentPresets/select", payload: { args: { agentId: "sb", agentPreset: "standard" } } }).ok, false);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "agentPresets/copy", payload: { args: { from: "x" } } }).ok, false);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "agentPresets/deletePreset", payload: { args: { id: "x" } } }).ok, false);
});

test("深度研究只读面放行（用户决策）；写操作维持拒绝", () => {
  const { config, ownership, alice } = fixture();
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "deepResearch/list", payload: { args: { request: {} } } }).ok, true);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "deepResearch/get", payload: { args: { request: { id: "research-x" } } } }).ok, true);
  for (const method of ["deepResearch/start", "deepResearch/resume", "deepResearch/complete", "deepResearch/fail", "deepResearch/delete", "deepResearch/updatePlan", "deepResearch/updateQuestion", "deepResearch/confirmPlan", "deepResearch/addEvidence", "deepResearch/writeReport"]) {
    assert.equal(guardMemberRequest({ config, ownership, user: alice, method, payload: { args: {} } }).ok, false, method);
  }
});

test("消息反馈按会话归属守卫（request 嵌套信封）", () => {
  const { config, ownership, alice } = fixture();
  for (const method of ["messageFeedback/list", "messageFeedback/put", "messageFeedback/delete"]) {
    assert.equal(guardMemberRequest({ config, ownership, user: alice, method, payload: { args: { request: { sessionId: "sa" } } } }).ok, true, method);
    assert.equal(guardMemberRequest({ config, ownership, user: alice, method, payload: { args: { request: { sessionId: "sb" } } } }).ok, false, method);
  }
});

test("members cannot switch permission preset away from workspace-write", () => {
  const { config, ownership, alice } = fixture();
  const allow = guardMemberRequest({ config, ownership, user: alice, method: "commands/execute", payload: { args: { agentId: "sa", line: "/permission" } } });
  assert.equal(allow.ok, true);
  const deny = guardMemberRequest({ config, ownership, user: alice, method: "commands/execute", payload: { args: { agentId: "sa", line: "/permission danger-full-access" } } });
  assert.equal(deny.ok, false);
});

test("agentId 按会话归属守卫（commands/execute）", () => {
  const { config, ownership, alice } = fixture();
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "commands/execute", payload: { args: { agentId: "sb", line: "/help" } } }).ok, false);
  assert.equal(guardMemberRequest({ config, ownership, user: alice, method: "commands/execute", payload: { args: { agentId: "sa", line: "/help" } } }).ok, true);
});

test("subagents/prompt 按 parent 归属守卫并预学习子会话", () => {
  const { config, ownership, alice } = fixture();
  const ok = guardMemberRequest({ config, ownership, user: alice, method: "subagents/prompt", payload: { args: { request: { requestId: "r1", parentSessionId: "sa", childSessionId: "child-new", mode: "continuable", content: [] } } } });
  assert.equal(ok.ok, true);
  assert.equal(ownership.sessionOwner.get("child-new"), "alice");
  const deny = guardMemberRequest({ config, ownership, user: alice, method: "subagents/prompt", payload: { args: { request: { requestId: "r2", parentSessionId: "sb", childSessionId: "c2", mode: "continuable", content: [] } } } });
  assert.equal(deny.ok, false);
});

test("session/page 的 address 嵌套归属守卫", () => {
  const { config, ownership, alice } = fixture();
  const ok = guardMemberRequest({ config, ownership, user: alice, method: "session/page", payload: { args: { request: { address: { kind: "session", sessionId: "sa" }, throughSeq: 1 } } } });
  assert.equal(ok.ok, true);
  const deny = guardMemberRequest({ config, ownership, user: alice, method: "session/page", payload: { args: { request: { address: { kind: "session", sessionId: "sb" }, throughSeq: 1 } } } });
  assert.equal(deny.ok, false);
});

test("session/create 成功后学习归属；fork 同理", () => {
  const { ownership, alice } = fixture();
  filterMemberResponse({ ownership, user: alice, method: "session/create", value: { sessionId: "s-new" } });
  assert.equal(ownership.sessionOwner.get("s-new"), "alice");
});

test("ownerOfPath 仅匹配成员工作区根", () => {
  const { config } = fixture();
  assert.equal(ownerOfPath(config, "/tmp/dsh-team-hub-test/workspaces/alice/proj"), "alice");
  assert.equal(ownerOfPath(config, "/tmp/dsh-team-hub-test/workspaces/alice2"), null);
});
