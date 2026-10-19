/* vendorkit — vendor app behaviour. No framework, no CDN, no inline handlers (CSP).
   Untrusted text (card names from data) is only ever set with textContent. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var QKEY = "vk_queue", IKEY = "vk_index";
  // PREVIEW (static, read-only copy for showing the app): taps never reach a server.
  var DEMO = document.body.getAttribute("data-demo") === "1";
  var INDEX_URL = document.body.getAttribute("data-index") || "/api/index";

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null");
    localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function money(v) { if (v === null || v === undefined) return "—"; v = +v;
    return v === Math.round(v) ? "$" + v.toLocaleString() : "$" + v.toFixed(2); }

  // ---------- toast ----------
  var toastTimer;
  function toast(msg, undo) {
    var t = $("#toast"); if (!t) return;
    t.textContent = ""; var span = document.createElement("span"); span.textContent = msg; t.appendChild(span);
    if (undo) { var b = document.createElement("button"); b.textContent = "Undo"; b.addEventListener("click", function () {
      t.hidden = true; undo(); }); t.appendChild(b); }
    t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, undo ? 8000 : 3500);
  }

  // ---------- actions + offline queue ----------
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-VK": "1" },
      body: JSON.stringify(body), credentials: "same-origin" }).then(function (r) {
        return r.json().then(function (j) { j._status = r.status; return j; }); });
  }
  function queue() { return store(QKEY) || []; }
  function showQueue() {
    var q = queue(), o = $("#offline"); if (!o) return;
    if (q.length) { o.textContent = q.length + (q.length === 1 ? " change" : " changes") + " saved on this phone — will sync"; o.hidden = false; }
    else o.hidden = true;
  }
  function act(body) {
    if (DEMO) return Promise.resolve({ ok: true, demo: true, _status: 200 });
    body.action_id = body.action_id || uid();
    body.tapped_at = body.tapped_at || new Date().toISOString();
    return post("/api/action", body).catch(function () {
      var q = queue(); q.push(body); store(QKEY, q); showQueue();
      return { ok: true, queued: true, _status: 0 };
    });
  }
  function flush() {
    if (DEMO) return;
    var q = queue(); if (!q.length) return;
    var next = q[0];
    post("/api/action", next).then(function (j) {
      // 2xx done, 4xx = will never apply (already sold, etc.): drop it either way, keep going
      var rest = queue().slice(1); store(QKEY, rest); showQueue();
      if (j._status >= 400) toast("A saved change couldn't apply: " + (j.error || "refused"));
      if (rest.length) flush(); else if (j.ok) toast("Synced");
    }).catch(function () { /* still offline */ });
  }
  window.addEventListener("online", flush);
  setInterval(flush, 20000);

  // ---------- generic buttons ----------
  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-act]"); if (!el) return;
    var a = el.getAttribute("data-act");
    if (a === "back") { if (history.length > 1) { e.preventDefault(); history.back(); } return; }
    if (a === "refresh") { e.preventDefault(); el.disabled = true; toast("Refreshing data…");
      post("/api/refresh", {}).then(function () { location.reload(); }).catch(function () { toast("Couldn't refresh"); el.disabled = false; });
      return; }
    if (a === "sold") { e.preventDefault(); markSold(el.getAttribute("data-id"), el.getAttribute("data-name")); return; }
    if (a === "undo_sold") { e.preventDefault(); act({ action: "undo_sold", item_id: el.getAttribute("data-id") }).then(function (j) {
      if (j.ok) location.reload(); else toast(j.error || "Couldn't undo"); }); return; }
    if (a === "dismiss" && DEMO) { e.preventDefault(); var r0 = el.closest(".row"); if (r0) r0.remove();
      toast("Preview: nothing is saved"); return; }
    if (a === "dismiss") { e.preventDefault(); var row = el.closest(".row");
      act({ action: "dismiss", item_id: el.getAttribute("data-id"), detail: el.getAttribute("data-detail") }).then(function (j) {
        if (j.ok && row) { row.remove(); toast("Done"); } }); return; }
  });

  function markSold(id, name, after) {
    if (DEMO) { toast("Preview: in the live app this marks " + (name || id) + " sold"); return; }
    act({ action: "sold", item_id: id }).then(function (j) {
      if (j.ok) {
        toast((j.queued ? "Saved on this phone: " : "Sold: ") + (name || id), function () {
          act({ action: "undo_sold", item_id: id }).then(function (u) {
            toast(u.ok ? "Undone" : (u.error || "Couldn't undo")); if (u.ok && !after) location.reload(); });
        });
        if (after) after(j); else setTimeout(function () { location.reload(); }, 900);
      } else toast(j.error === "not for sale" ? "Already sold" : (j.error || "Couldn't save"));
    });
  }

  // bring list ticks
  document.addEventListener("change", function (e) {
    var cb = e.target; if (!cb.matches || !cb.matches('input[data-act="bring_tick"]')) return;
    var row = cb.closest(".row"); if (row) row.classList.toggle("done", cb.checked);
    act({ action: "bring_tick", item_id: cb.getAttribute("data-id"), detail: cb.checked ? "on" : "off" });
    if (DEMO && !window._vkTold) { window._vkTold = 1; toast("Preview: ticks aren't saved"); }
    var done = $$('input[data-act="bring_tick"]:checked').length, p = $("#pbar"), d = $("#pdone");
    if (p) p.value = done; if (d) d.textContent = done;
  });
  $$("[data-autosubmit]").forEach(function (s) { s.addEventListener("change", function () { s.form.submit(); }); });

  // ---------- sell keypad (works offline from a cached index) ----------
  function loadIndex() {
    return fetch(INDEX_URL, { credentials: "same-origin" }).then(function (r) { return r.json(); })
      .then(function (j) { store(IKEY, j); return j; }).catch(function () { return store(IKEY); });
  }
  function lookup(idx, cc) {
    if (!idx) return null;
    for (var i = 0; i < idx.items.length; i++) if (idx.items[i][0] === cc) return idx.items[i];
    return null;
  }
  if (document.body.getAttribute("data-page") === "sell") {
    var digits = "", idx = store(IKEY), num = $("#ccnum"), find = $("#find"), found = $("#found");
    loadIndex().then(function (j) { if (j) idx = j; });
    var render = function () { num.textContent = digits; find.disabled = digits.length === 0; found.hidden = true; };
    $$(".key").forEach(function (k) { k.addEventListener("click", function () {
      var v = k.getAttribute("data-key");
      if (v === "clear") digits = ""; else if (v === "back") digits = digits.slice(0, -1);
      else if (digits.length < 6) digits += v;
      render(); }); });
    find.addEventListener("click", function () {
      var cc = "CC-" + ("0000" + digits).slice(-Math.max(4, digits.length));
      var r = lookup(idx, cc); found.textContent = "";
      if (!r) { var nf = document.createElement("div"); nf.className = "warn"; nf.textContent = cc + " isn't on the list (sold earlier, not listed, or a typo).";
        found.appendChild(nf); found.hidden = false; return; }
      var img;
      if (r[6]) { img = document.createElement("img"); img.src = r[6]; img.alt = ""; } else { img = document.createElement("span"); img.className = "ph"; }
      var box = document.createElement("div");
      var n = document.createElement("div"); n.className = "fn"; n.textContent = r[1];
      var s = document.createElement("div"); s.className = "rs"; s.textContent = cc + " · " + (r[2] || "") + (r[3] ? " · " + r[3] : "");
      var p = document.createElement("div"); p.className = "fp"; p.textContent = money(r[4]);
      box.appendChild(n); box.appendChild(s); box.appendChild(p);
      if (r[5] !== "for_sale") { var w = document.createElement("div"); w.className = "warn"; w.textContent = "Already marked sold"; box.appendChild(w); }
      else { var b = document.createElement("button"); b.id = "sellbtn"; b.className = "btn primary big"; b.textContent = "Mark sold";
        b.addEventListener("click", function () { b.disabled = true; markSold(cc, r[1], function () {
          r[5] = "sold"; store(IKEY, idx); digits = ""; render();
          setTimeout(function () { location.reload(); }, 1200); }); });
        box.appendChild(b); }
      found.appendChild(img); found.appendChild(box); found.hidden = false;
    });
  }

  // ---------- chart hover (crosshair on lines, per-mark tips on bars) ----------
  $$("svg.viz.line").forEach(function (svg) {
    var pts; try { pts = JSON.parse(svg.getAttribute("data-points")); } catch (e) { return; }
    var tip = svg.parentNode.querySelector(".tip"), xh = svg.querySelector(".xhair");
    var x0 = +svg.getAttribute("data-x0"), w = +svg.getAttribute("data-w");
    function at(evt) {
      var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      var x = (evt.clientX - r.left) * vb.width / r.width;
      var i = Math.round((x - x0) / w * (pts.length - 1)); i = Math.max(0, Math.min(pts.length - 1, i));
      var px = x0 + w * i / Math.max(pts.length - 1, 1);
      xh.setAttribute("x1", px); xh.setAttribute("x2", px); svg.classList.add("hovering");
      tip.textContent = ""; var b = document.createElement("b"); b.textContent = money(pts[i][1]);
      tip.appendChild(b); tip.appendChild(document.createTextNode("  " + pts[i][0]));
      tip.style.left = (px * r.width / vb.width) + "px"; tip.style.top = "8px"; tip.hidden = false;
    }
    svg.addEventListener("pointermove", at);
    svg.addEventListener("pointerleave", function () { svg.classList.remove("hovering"); tip.hidden = true; });
  });
  $$("svg.viz .bar[data-tip]").forEach(function (bar) {
    var fig = bar.closest("figure"), tip = fig && fig.querySelector(".tip"); if (!tip) return;
    bar.addEventListener("pointerenter", function () {
      var r = bar.getBoundingClientRect(), f = fig.getBoundingClientRect();
      tip.textContent = bar.getAttribute("data-tip");
      tip.style.left = (r.left - f.left + r.width / 2) + "px"; tip.style.top = (r.top - f.top) + "px"; tip.hidden = false; });
    bar.addEventListener("pointerleave", function () { tip.hidden = true; });
  });

  // Report a problem: the SAME Google Form + message format as the live store's "Suggest a fix"
  // (index.html sendReport), so pulse_qa form-fixes reads it with no change. Works in preview too:
  // Jack 2026-10-18 wants Andy able to report from the vendor side "just like the old way".
  var rf = $("#reportform");
  if (rf) rf.addEventListener("submit", function (e) {
    e.preventDefault();
    var d = rf.dataset, issue = $("#rpIssue").value, sp = ($("#rpPrice").value || "").replace(/[^0-9.]/g, "");
    var note = ($("#rpNote").value || "").trim(), f = JSON.parse(d.fields);
    var body = "A card fix was suggested from the vendor app.\n\n---\ntype: card-fix\ncard_id: " + d.card +
      "\nname: " + d.name + "\nset: " + d.set + "\nnumber: " + d.number + "\nissue: " + issue +
      "\ncurrent_price: " + d.price + "\nsuggested_price: " + sp + "\ncurrent_image: " + (d.image || "(none)") +
      "\nurl: " + d.url + "\nsource: " + d.source + "\n---\n\n" + (note || "(no details provided)") + "\n";
    var fd = new FormData();
    fd.append(f.type, "card-fix");
    fd.append(f.subject, "[CARD-FIX] " + issue + " — " + d.name + " (" + d.card + ")");
    fd.append(f.message, body);
    fd.append(f.contact, "(none)");                 // the form's contact field is REQUIRED (empty = silent 400)
    var btn = rf.querySelector("button"); btn.disabled = true;
    fetch(d.action, { method: "POST", mode: "no-cors", body: fd }).then(function () {
      rf.querySelectorAll("select,input,textarea,button").forEach(function (x) { x.hidden = true; });
      rf.querySelectorAll(".lbl").forEach(function (x) { x.hidden = true; });
      $("#rpDone").hidden = false;
    }).catch(function () { btn.disabled = false; toast("Couldn't send — check your signal and try again"); });
  });

  // sign-in (authenticator code): JSON + X-VK like every other write, so a cross-site form can't post it
  var lf = $("#loginform");
  if (lf) lf.addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#loginerr"); err.hidden = true;
    post("/login", { user: $("#who").value, code: $("#code").value.trim() }).then(function (j) {
      if (j.ok) location.href = "/";
      else { err.textContent = j.error || "That code didn't work"; err.hidden = false; $("#code").value = ""; $("#code").focus(); }
    }).catch(function () { err.textContent = "Can't reach the server"; err.hidden = false; });
  });

  // preview: the Cards search runs in the browser over the static index (no server to ask)
  var sform = $(".search");
  if (DEMO && sform) {
    sform.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = (sform.querySelector("input[name=q]").value || "").trim().toLowerCase(), list = $(".card.list");
      fetch(INDEX_URL).then(function (r) { return r.json(); }).then(function (j) {
        var words = q ? q.split(/\s+/) : [], rows = j.items.filter(function (r) {
          var hay = (r[0] + " " + r[1] + " " + (r[2] || "") + " " + (r[3] || "")).toLowerCase();
          return r[5] === "for_sale" && words.every(function (w) { return hay.indexOf(w) !== -1; });
        }).slice(0, 80);
        list.textContent = "";
        if (!rows.length) list.appendChild(Object.assign(document.createElement("div"), { className: "empty", textContent: "No cards match." }));
        rows.forEach(function (r) {
          var a = document.createElement("a"); a.className = "row"; a.href = "item-" + r[0] + ".html";
          if (r[6]) { var im = document.createElement("img"); im.className = "thumb"; im.src = r[6]; im.alt = ""; im.loading = "lazy"; a.appendChild(im); }
          var t = document.createElement("div"); t.className = "rt";
          var n = document.createElement("div"); n.className = "rn"; n.textContent = r[1];
          var s2 = document.createElement("div"); s2.className = "rs"; s2.textContent = (r[2] || "") + (r[3] ? " · " + r[3] : "");
          t.appendChild(n); t.appendChild(s2); a.appendChild(t);
          var p = document.createElement("div"); p.className = "rp"; p.textContent = money(r[4]); a.appendChild(p);
          list.appendChild(a);
        });
        var h = $(".hero .muted"); if (h) h.textContent = rows.length + (rows.length === 80 ? "+" : "") + " match";
        var pg = $(".pager"); if (pg) pg.hidden = true;
      });
    });
  }

  if (!DEMO) {
    showQueue(); flush();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(function () {});
  }
})();
