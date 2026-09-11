import test from "node:test";
import assert from "node:assert/strict";
import { createOwnership } from "../src/policy.mjs";
import { defaultConfig } from "../src/config.mjs";
import { createUser } from "../src/users.mjs";
import { classifyMemberStreamOpen, filterMemberStreamItem } from "../src/ws-filter.mjs";

function fixture() {
  const config = defaultConfig("/tmp/dsh-team-hub-ws");
  createUser(config, { name: "admin", role: "admin", password: "admin-pass-1" });
  createUser(config, { name: "alice", role: "member", password: "alice-pass-1" });
  createUser(config, { name: "bob", role: "member", password: "bob-pass-123" });
  const ownership = createOwnership();
  ownership.sessionOwner.set("sa", "alice");
  ownership.sessionOwner.set("sb", "bob");
  ownership.workspaceOwner.set("wa", "alice");
  ownership.workspaceOwner.set("wb", "bob");
  return { config, ownership, user: config.users[1] };
}

test("stream open: $events 与 session/control 放行，未知端点拒绝", () => {
  const { ownership, user } = fixture();
  assert.deepEqual(classifyMemberStreamOpen({ ownership, user, endpoint: "$events", payload: { args: {} } }), { kind: "events" });
  assert.deepEqual(classifyMemberStreamOpen({ ownership, user, endpoint: "session/control", payload: { args: {} } }), { kind: "control" });
  assert.equal(classifyMemberStreamOpen({ ownership, user, endpoint: "credentials/set", payload: { args: {} } }), null);
});

test("stream open: session/follow 按 address 归属授权", () => {
  const { ownership, user } = fixture();
  const own = classifyMemberStreamOpen({ ownership, user, endpoint: "session/follow", payload: { args: { request: { address: { kind: "session", sessionId: "sa" } } } } });
  assert.deepEqual(own, { kind: "follow", sessionId: "sa" });
  const other = classifyMemberStreamOpen({ ownership, user, endpoint: "session/follow", payload: { args: { request: { address: { kind: "session", sessionId: "sb" } } } } });
  assert.equal(other, null);
});

test("events stream: ready 放行，api-session/* 按归属过滤", () => {
  const { config, ownership, user } = fixture();
  const ready = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "ready", clientId: "c1", host: { home: "/h" } } } });
  assert.equal(ready.pass, true);
  const own = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "emit", event: "api-session/status", args: ["sa", true] } } });
  assert.equal(own.pass, true);
  const other = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "emit", event: "api-session/status", args: ["sb", true] } } });
  assert.equal(other.pass, false);
});

test("events stream: 宿主级事件（credentials/commands/cordis）对成员默认丢弃", () => {
  const { config, ownership, user } = fixture();
  const frame = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "emit", event: "credentials/reference-updated", args: ["x"] } } });
  assert.equal(frame.pass, false);
});

test("events stream: commands/change 全局放行，agent-preset/selected 按归属放行", () => {
  const { config, ownership, user } = fixture();
  const cmd = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "emit", event: "commands/change", args: [] } } });
  assert.equal(cmd.pass, true);
  const own = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "emit", event: "agent-preset/selected", args: ["sa", "standard"] } } });
  assert.equal(own.pass, true);
  const other = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "emit", event: "agent-preset/selected", args: ["sb", "standard"] } } });
  assert.equal(other.pass, false);
});

test("events stream: api-session/added 学习归属后再转发", () => {
  const { config, ownership, user } = fixture();
  const summary = { sessionId: "s-new", cwd: "/tmp/dsh-team-hub-ws/workspaces/alice/proj" };
  const frame = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "emit", event: "api-session/added", args: [summary] } } });
  assert.equal(frame.pass, true);
  assert.equal(ownership.sessionOwner.get("s-new"), "alice");
});

test("events stream: waterfall 按 request 归属放行", () => {
  const { config, ownership, user } = fixture();
  const own = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "waterfall", event: "approval/request", eventId: "e1", agentId: "a1", request: { sessionId: "sa" } } } });
  assert.equal(own.pass, true);
  const other = filterMemberStreamItem({ config, ownership, user, stream: { kind: "events" }, frame: { type: "item", streamId: "s1", value: { type: "waterfall", event: "approval/request", eventId: "e2", agentId: "a2", request: { sessionId: "sb" } } } });
  assert.equal(other.pass, false);
});

test("control stream: baseline 裁剪为成员自己的会话", () => {
  const { config, ownership, user } = fixture();
  const verdict = filterMemberStreamItem({ config, ownership, user, stream: { kind: "control" }, frame: {
    type: "item", streamId: "s1",
    value: {
      type: "baseline",
      value: {
        queues: { sa: [1], sb: [2], other: [3] },
        jobs: { sa: [], sb: [] },
        projections: { sa: {}, other: {} }
      }
    }
  }});
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.frame.value.value, {
    queues: { sa: [1] }, jobs: { sa: [] }, projections: { sa: {} }
  });
});

test("control stream: queue/jobs/projection 帧按 sessionId 过滤", () => {
  const { config, ownership, user } = fixture();
  const own = filterMemberStreamItem({ config, ownership, user, stream: { kind: "control" }, frame: { type: "item", streamId: "s1", value: { type: "queue", sessionId: "sa", items: [] } } });
  assert.equal(own.pass, true);
  const other = filterMemberStreamItem({ config, ownership, user, stream: { kind: "control" }, frame: { type: "item", streamId: "s1", value: { type: "jobs", sessionId: "sb", jobs: [] } } });
  assert.equal(other.pass, false);
});

test("follow stream: 帧原样放行", () => {
  const { config, ownership, user } = fixture();
  const frame = { type: "item", streamId: "s1", value: { type: "event", seq: 1, time: 1, data: {} } };
  const verdict = filterMemberStreamItem({ config, ownership, user, stream: { kind: "follow", sessionId: "sa" }, frame });
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.frame, frame);
});

test("workspace/follow 流放行，baseline 裁剪为成员自己的工作区", () => {
  const { config, ownership, user } = fixture();
  assert.deepEqual(classifyMemberStreamOpen({ ownership, user, endpoint: "workspace/follow", payload: { args: {} } }), { kind: "workspace-follow" });
  const verdict = filterMemberStreamItem({ config, ownership, user, stream: { kind: "workspace-follow" }, frame: {
    type: "item", streamId: "s1",
    value: {
      type: "baseline",
      value: {
        items: [
          { workspaceId: "wa", path: "/tmp/dsh-team-hub-ws/workspaces/alice" },
          { workspaceId: "wb", path: "/tmp/dsh-team-hub-ws/workspaces/bob" },
          { workspaceId: "wadmin", path: "/Users/admin/proj" }
        ],
        archivedSessionIds: ["sa", "sb"]
      }
    }
  }});
  assert.equal(verdict.pass, true);
  assert.deepEqual(verdict.frame.value.value.items.map(w => w.workspaceId), ["wa"]);
  assert.deepEqual(verdict.frame.value.value.archivedSessionIds, ["sa"]);
});

test("workspace/follow 增量帧按归属过滤", () => {
  const { config, ownership, user } = fixture();
  const ownUpsert = filterMemberStreamItem({ config, ownership, user, stream: { kind: "workspace-follow" }, frame: { type: "item", streamId: "s1", value: { type: "upsert", workspace: { workspaceId: "wa", path: "/tmp/dsh-team-hub-ws/workspaces/alice" } } } });
  assert.equal(ownUpsert.pass, true);
  const otherUpsert = filterMemberStreamItem({ config, ownership, user, stream: { kind: "workspace-follow" }, frame: { type: "item", streamId: "s1", value: { type: "upsert", workspace: { workspaceId: "wb", path: "/tmp/dsh-team-hub-ws/workspaces/bob" } } } });
  assert.equal(otherUpsert.pass, false);
  const order = filterMemberStreamItem({ config, ownership, user, stream: { kind: "workspace-follow" }, frame: { type: "item", streamId: "s1", value: { type: "order", workspaceIds: ["wa", "wb"] } } });
  assert.deepEqual(order.frame.value.workspaceIds, ["wa"]);
});
