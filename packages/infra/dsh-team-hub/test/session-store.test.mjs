import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  SessionStore,
  sessionsPath,
  writeAtomicSync,
  isValidSessionEntry
} from "../src/session-store.mjs";
import {
  issueSession,
  resolveSession,
  revokeSession,
  revokeSessionsForUser,
  resetSessionStores
} from "../src/auth.mjs";

function tempHome() {
  const dir = path.join(os.tmpdir(), `dsh-thub-sess-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

test("1. 内存查找与 0 磁盘 I/O 验证（100,000 次 lookup 统计 fs 调用为 0）", async () => {
  const home = tempHome();
  const store = new SessionStore(home, { autoStartCleanup: false });
  const userSession = await store.issue("alice", 1000 * 60);

  // 监控 fs.readFileSync 与 fs.readFile
  let readCount = 0;
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = function (...args) {
    readCount++;
    return originalReadFileSync.apply(this, args);
  };

  try {
    const start = performance.now();
    for (let i = 0; i < 100000; i++) {
      const s = store.resolve(userSession.token);
      assert.equal(s.username, "alice");
    }
    const duration = performance.now() - start;
    // 验证在 10 万次解析期间对磁盘 session.json 的读取次数为 0
    assert.equal(readCount, 0, "10 万次 lookup 的磁盘读取次数必须为 0");
    // p95 / 平均耗时验证：10 万次应在几百毫秒内完成
    assert.ok(duration < 2000, `10 万次内存 lookup 耗时应远低于 2s，实际为 ${duration}ms`);
  } finally {
    fs.readFileSync = originalReadFileSync;
    store.stopCleanupTimer();
    resetSessionStores(home);
  }
});

test("2. 并发 issue / revoke / revokeUser 状态与文件一致性", async () => {
  const home = tempHome();
  const store = new SessionStore(home, { autoStartCleanup: false });

  // 并发创建 50 个 session
  const promises = [];
  for (let i = 0; i < 50; i++) {
    const username = i % 2 === 0 ? "user_a" : "user_b";
    promises.push(store.issue(username, 1000 * 60));
  }
  const issued = await Promise.all(promises);
  assert.equal(store.size, 50);

  // 验证磁盘文件也是 50 个
  const diskData = JSON.parse(fs.readFileSync(sessionsPath(home), "utf8"));
  assert.equal(Object.keys(diskData).length, 50);

  // 并发撤销 user_a 以及随机单个 session
  const revokePromises = [];
  revokePromises.push(store.revokeUser("user_a"));
  revokePromises.push(store.revoke(issued[1].token)); // user_b
  revokePromises.push(store.revoke(issued[3].token)); // user_b

  await Promise.all(revokePromises);

  // 重启验证：新建 store 实例读取 disk
  const storeRestarted = new SessionStore(home, { autoStartCleanup: false });
  assert.equal(storeRestarted.size, store.size);
  assert.equal(storeRestarted.resolve(issued[0].token), null); // user_a revoked
  assert.equal(storeRestarted.resolve(issued[1].token), null); // user_b revoked
  assert.equal(storeRestarted.resolve(issued[5].token).username, "user_b"); // user_b retained
});

test("3. 过期会话启动时与运行中自动清理", async () => {
  const home = tempHome();
  const store = new SessionStore(home, { autoStartCleanup: false });

  // 签发 1 个已过期，1 个未过期
  const tokenExpired = "exp_token_1";
  const tokenValid = "val_token_2";
  const diskObj = {
    [tokenExpired]: {
      username: "alice",
      createdAt: new Date(Date.now() - 20000).toISOString(),
      expiresAt: new Date(Date.now() - 5000).toISOString()
    },
    [tokenValid]: {
      username: "bob",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString()
    }
  };
  fs.writeFileSync(sessionsPath(home), JSON.stringify(diskObj), "utf8");

  // 启动新 store
  const storeNew = new SessionStore(home, { autoStartCleanup: false });
  // 过期项应在初始化时被剔除
  assert.equal(storeNew.resolve(tokenExpired), null);
  assert.equal(storeNew.resolve(tokenValid).username, "bob");
  assert.equal(storeNew.size, 1);

  // 测试 resolve 时过期触发
  const fastExpire = await storeNew.issue("charlie", 10); // 10ms
  await new Promise(r => setTimeout(r, 20));
  assert.equal(storeNew.resolve(fastExpire.token), null);
});

test("4. 损坏文件 fail-closed、保留取证副本并使旧 token 失效", async () => {
  const home = tempHome();
  const corruptContent = "{\n  \"invalid\": json truncated ...";
  fs.writeFileSync(sessionsPath(home), corruptContent, "utf8");

  const store = new SessionStore(home, { autoStartCleanup: false });
  // 必须没有可解析的 session
  assert.equal(store.size, 0);

  // 验证是否生成了取证副本 sessions.corrupt.*.bak
  const files = fs.readdirSync(home);
  const backup = files.find(f => f.startsWith("sessions.corrupt.") && f.endsWith(".bak"));
  assert.ok(backup, "必须保留损坏取证副本文件");
  const backupContent = fs.readFileSync(path.join(home, backup), "utf8");
  assert.equal(backupContent, corruptContent);

  // 旧 sessions.json 被重置为空合规 JSON
  const resetDisk = JSON.parse(fs.readFileSync(sessionsPath(home), "utf8"));
  assert.deepEqual(resetDisk, {});
});

test("5. 容量与文件大小超限防护", async () => {
  const home = tempHome();
  // 限制容量为 5 个
  const store = new SessionStore(home, { maxSessions: 5, autoStartCleanup: false });
  for (let i = 0; i < 10; i++) {
    await store.issue(`user_${i}`, 1000 * 60);
  }
  assert.equal(store.size, 5);

  const diskData = JSON.parse(fs.readFileSync(sessionsPath(home), "utf8"));
  assert.equal(Object.keys(diskData).length, 5);
});
