window.__ModuleLoader__.load({
  id: "dsh-my-quotes",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var CHANNEL = "/my-quotes";
    var CAT_NAMES = { task: "任务指令", qa: "咨询问答", content: "内容创作", code: "代码开发", design: "设计品牌", ecom: "选品电商", research: "数据研究", system: "系统配置", other: "其他" };
    var ACCENT = "var(--dsw-alias-state-business-primary)";
    // 官方控制器引用（apply 时注入；tryJump 只会在面板打开后调用，必已就绪）
    var sessions = null;
    var workspaces = null;

    var CSS = [
      // ---- Tab 按钮：与官方对话 Tab 完全同调（下划线式，继承 tabs 容器 gap） ----
      ".dsh-mq-tab{color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;padding:0 0 11px;font-size:13px;font-weight:500;line-height:16px;position:relative;display:inline-flex;align-items:center;gap:5px;font-family:var(--dsw-font-family)}",
      ".dsh-mq-tab:after{content:'';background:0 0;border-radius:2px;height:2px;position:absolute;bottom:1px;left:0;right:0}",
      ".dsh-mq-tab:hover{color:var(--dsw-alias-label-primary)}",
      ".dsh-mq-tab.on{color:" + ACCENT + "}",
      ".dsh-mq-tab.on:after{background:" + ACCENT + "}",
      ".dsh-mq-tab .mq-dot{width:5px;height:5px;border-radius:50%;background:#58B848;opacity:.9;flex:none}",
      // ---- 面板 ----
      ".dsh-mq-panel{position:fixed;top:64px;right:12px;width:440px;max-width:calc(100vw - 24px);height:min(680px,76vh);display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-2,#1d2026);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-alias-radius-md,14px);box-shadow:0 18px 52px rgba(0,0,0,.42);z-index:2147483000;overflow:hidden;font-family:var(--dsw-font-family)}",
      ".dsh-mq-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l2)}",
      ".dsh-mq-head .t{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:7px}",
      ".dsh-mq-head .t .mq-dot{width:6px;height:6px;border-radius:50%;background:#58B848}",
      ".dsh-mq-head .cnt{font-size:11px;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-bg-module-platform,var(--dsw-alias-bg-layer-3));border-radius:999px;padding:1px 8px;line-height:16px}",
      ".dsh-mq-head .sp{flex:1}",
      ".dsh-mq-head button{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;padding:3px 9px;border-radius:7px;cursor:pointer;font-family:inherit;line-height:16px}",
      ".dsh-mq-head button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dsh-mq-head button:disabled{opacity:.5;cursor:default}",
      ".dsh-mq-search{padding:12px 16px 8px}",
      ".dsh-mq-search input{box-sizing:border-box;width:100%;height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12.5px;line-height:18px;outline:none;font-family:inherit}",
      ".dsh-mq-search input:focus{border-color:" + ACCENT + "}",
      ".dsh-mq-search input::placeholder{color:var(--dsw-alias-label-dimmed,var(--dsw-alias-label-tertiary))}",
      ".dsh-mq-chips{display:flex;flex-wrap:wrap;gap:6px;padding:4px 16px 10px;max-height:88px;overflow-y:auto;overscroll-behavior:contain}",
      ".dsh-mq-chip{border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:1px 10px;font-size:12px;line-height:18px;cursor:pointer;color:var(--dsw-alias-label-secondary);background:transparent;white-space:nowrap;font-family:inherit}",
      ".dsh-mq-chip:hover{border-color:" + ACCENT + ";color:var(--dsw-alias-label-primary)}",
      ".dsh-mq-chip.on{background:" + ACCENT + ";border-color:" + ACCENT + ";color:var(--dsw-alias-label-primary-foreground,#fff)}",
      ".dsh-mq-chip .n{opacity:.72;margin-left:4px;font-size:11px}",
      ".dsh-mq-toolbar{display:flex;gap:10px;align-items:center;padding:0 16px 10px}",
      ".dsh-mq-toolbar select{height:28px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;padding:0 8px;outline:none;font-family:inherit}",
      ".dsh-mq-toolbar .hint{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary)}",
      ".dsh-mq-list{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 12px 10px;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}",
      ".dsh-mq-item{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:10px 12px;margin:0 0 8px;background:var(--dsw-alias-bg-layer-3);transition:border-color .12s}",
      ".dsh-mq-item:hover{border-color:var(--dsw-alias-label-dimmed,var(--dsw-alias-border-l3))}",
      ".dsh-mq-item .txt{font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}",
      ".dsh-mq-item .meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:7px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}",
      ".dsh-mq-item .meta .sep{opacity:.4}",
      ".dsh-mq-item .cat{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:0 8px;line-height:17px}",
      ".dsh-mq-item .cat .mq-dot{width:4px;height:4px;border-radius:50%;background:#58B848;opacity:.85}",
      ".dsh-mq-item .actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l2)}",
      ".dsh-mq-item .actions button,.dsh-mq-item .actions select{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;padding:2px 9px;border-radius:6px;cursor:pointer;font-family:inherit}",
      ".dsh-mq-item .actions button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dsh-mq-item .actions button:disabled{opacity:.5;cursor:default}",
      ".dsh-mq-item .actions .refine{color:#58B848;border-color:rgba(88,184,72,.45)}",
      ".dsh-mq-item .actions .refine:hover{background:rgba(88,184,72,.1);color:#58B848}",
      ".dsh-mq-more{display:block;margin:2px auto 10px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;padding:4px 18px;border-radius:8px;cursor:pointer;font-family:inherit}",
      ".dsh-mq-more:hover{background:var(--dsw-alias-interactive-bg-hover)}",
      ".dsh-mq-empty{padding:44px 24px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.7}",
      ".dsh-mq-empty .big{font-size:22px;margin-bottom:6px;opacity:.6}",
      ".dsh-mq-loading{padding:44px 24px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12.5px}",
      ".dsh-mq-foot{display:flex;align-items:center;gap:10px;padding:9px 16px;border-top:1px solid var(--dsw-alias-border-l2);font-size:11px;color:var(--dsw-alias-label-tertiary)}",
      ".dsh-mq-foot .sp{flex:1}",
      ".dsh-mq-foot button{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;padding:2px 9px;border-radius:7px;cursor:pointer;font-family:inherit}",
      ".dsh-mq-foot button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".dsh-mq-toast{position:fixed;left:50%;bottom:40px;transform:translateX(-50%);background:var(--dsw-alias-label-primary,#e8e8ea);color:var(--dsw-alias-bg-layer-3,#141619);font-size:12px;padding:6px 14px;border-radius:999px;z-index:2147483001;font-family:var(--dsw-font-family);box-shadow:0 6px 20px rgba(0,0,0,.3)}",
    ].join("\n");

    function injectStyle() {
      if (document.getElementById("dsh-mq-style")) return;
      var s = document.createElement("style");
      s.id = "dsh-mq-style";
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    function fmtTime(t) {
      if (!t) return "";
      var d = new Date(t);
      var now = new Date();
      var p = function (n) { return (n < 10 ? "0" : "") + n; };
      var md = (d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
      return d.getFullYear() === now.getFullYear() ? md : d.getFullYear() + "-" + md;
    }

    function toast(msg) {
      var old = document.querySelector(".dsh-mq-toast");
      if (old) old.remove();
      var el = document.createElement("div");
      el.className = "dsh-mq-toast";
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, 2600);
    }

    function copyText(text, cb) {
      function done(ok) { cb(ok); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { done(true); }, function () { legacy(); });
      } else legacy();
      function legacy() {
        try {
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed"; ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand("copy");
          ta.remove();
          done(ok);
        } catch (e) { done(false); }
      }
    }

    // 跳转：直接走官方 sessions.open（与侧边栏点击会话行/搜索结果行同一条跨工作区路径）。
    // 不再填任何搜索框 → 侧边栏目录树永不被搜索结果视图替换（修「回不去工作区目录」）。
    function tryJump(r) {
      var archived = [];
      try {
        var wsSnap = workspaces && workspaces.list && workspaces.list.getSnapshot && workspaces.list.getSnapshot();
        archived = (wsSnap && wsSnap.archivedSessionIds) || [];
      } catch (e) {}
      if (archived.indexOf(r.sessionId) !== -1) {
        copyText(r.title || r.sessionId, function () { toast("该会话已归档，无法打开；已复制标题"); });
        return;
      }
      var attempt = function (retries) {
        try {
          sessions.open(r.sessionId);
          toast("已打开原会话");
        } catch (e) {
          if (retries > 0) { setTimeout(function () { attempt(retries - 1); }, 800); return; }
          copyText(r.title || r.sessionId, function () { toast("会话不存在（可能已删除），已复制标题"); });
        }
      };
      attempt(1); // 列表首拉未完成时 open 会同步抛错 → 800ms 后重试一次
    }

    function makePanel(call, close) {
      var root = document.createElement("div");
      root.className = "dsh-mq-panel";
      root.setAttribute("data-dsh-mq-panel", "1");
      var state = { query: "", catId: "all", project: "all", items: [], total: 0, offset: 0, status: { total: 0, categories: {}, projects: {} }, busy: false, seq: 0, loaded: false };

      function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
      }

      // ---- 头部 ----
      var head = el("div", "dsh-mq-head");
      var ttl = el("span", "t", "我说");
      var dot = el("span", "mq-dot"); ttl.prepend(dot);
      var cnt = el("span", "cnt", "…");
      var sp = el("span", "sp");
      var btnRefresh = el("button", "", "刷新");
      var btnClose = el("button", "", "×");
      head.append(ttl, cnt, sp, btnRefresh, btnClose);
      root.appendChild(head);

      // ---- 搜索 ----
      var searchWrap = el("div", "dsh-mq-search");
      var searchInput = document.createElement("input");
      searchInput.placeholder = "搜索我说过的话 / 会话标题…";
      searchWrap.appendChild(searchInput);
      root.appendChild(searchWrap);

      // ---- 分类 chips ----
      var chips = el("div", "dsh-mq-chips");
      root.appendChild(chips);

      // ---- 工具栏（项目筛选 + 更新提示） ----
      var toolbar = el("div", "dsh-mq-toolbar");
      var projSelect = document.createElement("select");
      var hint = el("span", "hint", "");
      toolbar.append(projSelect, hint);
      root.appendChild(toolbar);

      // ---- 列表 ----
      var list = el("div", "dsh-mq-list");
      root.appendChild(list);

      // ---- 底部 ----
      var foot = el("div", "dsh-mq-foot");
      var footInfo = el("span", "");
      var footSp = el("span", "sp");
      var btnRescan = el("button", "", "重建索引");
      var btnFootClose = el("button", "", "关闭");
      foot.append(footInfo, footSp, btnRescan, btnFootClose);
      root.appendChild(foot);

      function renderChips() {
        chips.innerHTML = "";
        var cats = state.status.categories || {};
        var mk = function (id, label, count) {
          var b = el("button", "dsh-mq-chip" + (state.catId === id ? " on" : ""));
          b.textContent = label;
          if (count !== undefined) {
            var n = el("span", "n", String(count));
            b.appendChild(n);
          }
          b.onclick = function () { state.catId = id; state.offset = 0; renderChips(); load(false); };
          chips.appendChild(b);
        };
        mk("all", "全部", state.status.total);
        var order = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; });
        for (var i = 0; i < order.length; i++) {
          var id = order[i];
          mk(id, CAT_NAMES[id] || id, cats[id]);
        }
      }

      function renderProjects() {
        projSelect.innerHTML = "";
        var opt = document.createElement("option");
        opt.value = "all"; opt.textContent = "全部项目";
        projSelect.appendChild(opt);
        var keys = Object.keys(state.status.projects || {}).sort(function (a, b) { return state.status.projects[b] - state.status.projects[a]; });
        for (var i = 0; i < keys.length; i++) {
          var o = document.createElement("option");
          o.value = keys[i];
          o.textContent = keys[i] + "（" + state.status.projects[keys[i]] + "）";
          if (keys[i] === state.project) o.selected = true;
          projSelect.appendChild(o);
        }
        projSelect.onchange = function () { state.project = projSelect.value; state.offset = 0; load(false); };
      }

      function renderItem(r) {
        var item = el("div", "dsh-mq-item");
        item.appendChild(el("div", "txt", r.snippet));
        var meta = el("div", "meta");
        meta.appendChild(el("span", "", fmtTime(r.time)));
        meta.appendChild(el("span", "sep", "·"));
        meta.appendChild(el("span", "", r.project));
        meta.appendChild(el("span", "sep", "·"));
        meta.appendChild(el("span", "", (r.title || "无标题").slice(0, 22)));
        var cat = el("span", "cat");
        var cdot = el("span", "mq-dot"); cat.append(cdot, document.createTextNode(r.category));
        meta.appendChild(cat);
        item.appendChild(meta);

        var actions = el("div", "actions");
        var bJump = el("button", "", "跳转");
        bJump.onclick = function () { tryJump(r); };
        var bCopy = el("button", "", "复制全文");
        bCopy.onclick = function () { copyText(r.text, function (ok) { toast(ok ? "已复制全文" : "复制失败"); }); };
        var sel = document.createElement("select");
        sel.innerHTML = Object.keys(CAT_NAMES).map(function (k) {
          return '<option value="' + k + '"' + (k === r.catId ? " selected" : "") + ">" + CAT_NAMES[k] + "</option>";
        }).join("");
        sel.onchange = function () {
          sel.disabled = true;
          call("reclassify", { fp: r.fp, catId: sel.value }).then(function () {
            r.catId = sel.value; r.category = CAT_NAMES[sel.value]; r.lowConfidence = false;
            toast("已改为「" + CAT_NAMES[sel.value] + "」");
            refreshItem(item, r);
          }, function (e) { toast("改类失败"); sel.disabled = false; });
        };
        actions.append(bJump, bCopy, sel);
        if (r.lowConfidence && !r.overridden) {
          var bRefine = el("button", "refine", "AI 精分");
          bRefine.onclick = function () {
            bRefine.disabled = true; bRefine.textContent = "精分中…";
            call("refine", { fp: r.fp }).then(function (v) {
              if (v && v.ok === false) { toast("LLM 不可用，保持规则分类"); }
              else { r.catId = v.catId; r.category = v.category; r.overridden = true; r.lowConfidence = false; toast("精分完成 → " + v.category); }
              refreshItem(item, r);
            }, function () { toast("精分失败"); bRefine.disabled = false; bRefine.textContent = "AI 精分"; });
          };
          actions.appendChild(bRefine);
        }
        item.appendChild(actions);
        return item;
      }

      function refreshItem(item, r) {
        var next = renderItem(r);
        item.replaceWith(next);
      }

      function renderList() {
        list.innerHTML = "";
        if (!state.loaded) {
          list.appendChild(el("div", "dsh-mq-loading", "正在加载…"));
          return;
        }
        if (state.items.length === 0) {
          var empty = el("div", "dsh-mq-empty");
          empty.appendChild(el("div", "big", "🔎"));
          empty.appendChild(el("div", "", "没有匹配的发言（收录 ≥30 字的用户消息）"));
          list.appendChild(empty);
          return;
        }
        for (var i = 0; i < state.items.length; i++) list.appendChild(renderItem(state.items[i]));
        if (state.items.length < state.total) {
          var more = el("button", "dsh-mq-more", "加载更多（" + state.items.length + " / " + state.total + "）");
          more.onclick = function () { state.offset += 50; load(true); };
          list.appendChild(more);
        }
      }

      function renderFoot() {
        footInfo.textContent = "共 " + state.total + " 条";
        hint.textContent = "已显示 " + Math.min(state.offset + state.items.length, state.total);
      }

      function load(append) {
        if (state.busy) return;
        state.busy = true;
        var seq = ++state.seq;
        call("list", { query: state.query, catId: state.catId, project: state.project, limit: 50, offset: append ? state.offset : 0 })
          .then(function (v) {
            if (seq !== state.seq) return; // 丢弃过期响应
            state.items = append ? state.items.concat(v.items) : v.items;
            state.total = v.total;
            state.loaded = true;
            renderList(); renderFoot();
          })
          .catch(function (e) {
            if (seq !== state.seq) return;
            state.loaded = true;
            list.innerHTML = "";
            list.appendChild(el("div", "dsh-mq-empty", "加载失败：" + (e && e.message ? e.message : e) + "（点击「刷新」重试）"));
          })
          .finally(function () { state.busy = false; });
      }

      function loadStatus() {
        call("status").then(function (v) {
          state.status = v;
          cnt.textContent = "共 " + v.total + " 条";
          renderChips(); renderProjects();
        }).catch(function () {});
      }

      var timer = null;
      searchInput.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(function () { state.query = searchInput.value.trim(); state.offset = 0; load(false); }, 300);
      });

      btnRefresh.onclick = function () {
        btnRefresh.disabled = true;
        call("rescan", { full: false }).then(function () {
          toast("已刷新");
          state.offset = 0; state.items = [];
          loadStatus(); load(false);
        }).catch(function (e) { toast("刷新失败"); }).finally(function () { btnRefresh.disabled = false; });
      };

      btnRescan.onclick = function () {
        btnRescan.disabled = true; btnRescan.textContent = "扫描中…";
        call("rescan", { full: true }).then(function (v) {
          toast("重建完成：" + v.total + " 条");
          state.offset = 0; state.items = [];
          loadStatus(); load(false);
        }).catch(function (e) { toast("重建失败"); }).finally(function () { btnRescan.disabled = false; btnRescan.textContent = "重建索引"; });
      };

      btnClose.onclick = close;
      btnFootClose.onclick = close;

      loadStatus();
      load(false);
      setTimeout(function () { try { searchInput.focus(); } catch (e) {} }, 60);
      return root;
    }

    function findTabBar() {
      var el = document.querySelector('[class*="_4RFuWq_tabs"]');
      if (el) return el;
      var rl = document.querySelector('[role="tablist"]');
      if (rl) return rl;
      var btns = document.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].textContent || "").trim();
        if (t === "会话" || t === "Sessions" || t === "Chats") {
          var p = btns[i].parentElement;
          if (p) return p;
        }
      }
      return null;
    }

    exports.inject = ["slots", "connection", "sessions", "workspaces"];

    exports.apply = function (ctx) {
      injectStyle();
      var connection = ctx.get("connection");
      sessions = ctx.get("sessions");
      workspaces = ctx.get("workspaces");
      window.__dsh_mq_ctx = ctx;

      function call(endpoint, payload) {
        return connection.rpc.call(CHANNEL, endpoint, payload || {}, undefined).then(function (res) {
          if (!res || res.ok !== true) throw new Error(res && res.error ? res.error.message : "rpc failed");
          return res.value;
        });
      }

      var panel = null;
      var tabBtn = null;
      var open = false;

      function toggle() {
        open = !open;
        if (open) {
          if (!panel) panel = makePanel(call, function () { toggle(); });
          document.body.appendChild(panel);
        } else if (panel && panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
        if (tabBtn) {
          if (open) tabBtn.classList.add("on");
          else tabBtn.classList.remove("on");
        }
      }

      window.addEventListener("dsh-my-quotes:toggle", toggle);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && open) toggle();
      });
      document.addEventListener("mousedown", function (e) {
        if (!open || !panel) return;
        if (panel.contains(e.target)) return;
        if (tabBtn && tabBtn.contains(e.target)) return;
        toggle();
      });

      function ensureTab() {
        if (tabBtn && tabBtn.isConnected) return;
        var bar = findTabBar();
        if (!bar) return;
        var existing = bar.querySelector("[data-dsh-mq-tab]");
        if (existing) { tabBtn = existing; return; }
        tabBtn = document.createElement("button");
        tabBtn.type = "button";
        tabBtn.className = "dsh-mq-tab";
        tabBtn.setAttribute("data-dsh-mq-tab", "1");
        tabBtn.innerHTML = '<span class="mq-dot"></span>我说';
        tabBtn.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });
        bar.appendChild(tabBtn);
      }

      // 持久轻量轮询兜底（替代 MutationObserver：后者观察 document.body 子树，
      // 每次打字 composer 重渲染都会触发 ensureTab → appendChild → 与 React 重协调打架 → 抖动）
      var iv = setInterval(function () { ensureTab(); }, 2000);

      ctx.effect(function () {
        return function () {
          clearInterval(iv);
          window.removeEventListener("dsh-my-quotes:toggle", toggle);
        };
      }, "dsh-my-quotes: cleanup");

      // 设置页兜底入口
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "my-quotes",
          order: 98,
          label: function () { return "我说"; }
        }, function MyQuotesSettingsEntry() {
          return React.createElement("div", { style: { padding: "4px 0" } },
            React.createElement("button", {
              type: "button",
              onClick: function () { window.dispatchEvent(new CustomEvent("dsh-my-quotes:toggle")); },
              style: {
                border: "1px solid var(--dsw-alias-border-l2)", background: "transparent", color: "var(--dsw-alias-label-secondary)",
                padding: "4px 12px", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontFamily: "inherit"
              }
            }, "打开「我说」面板"));
        });
      });
    };

    return module.exports;
  }
});
