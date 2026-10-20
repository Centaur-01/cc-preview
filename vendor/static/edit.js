/* vendorkit — Edit cards (PKM-024 MOCK, 2026-10-20). Andy's sheet as a screen.
   Sorting, filtering and search change the VIEW only. Every change is held in `pending`,
   keyed by the card's Item ID, never by a row position: the 10-15 sort that moved column A
   away from its rows cannot happen here. This mock has no write path (no POST anywhere).
   Untrusted text (card names, notes) is only ever set with textContent (CSP: no inline). */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = $("#grid"); if (!root) return;

  var K = ["id", "name", "sub", "grade", "cond", "owner", "status", "ours", "site", "img",
           "yours", "notes", "better", "sold", "onsite"];
  var LABEL = { yours: "Your price", notes: "Notes", better: "Better name", sold: "Sold", onsite: "On site" };
  var STATUS = { for_sale: "For sale", hidden: "Not listed", sold: "Sold" };
  var rows = [], byId = {}, view = [], shown = 0, CHUNK = 150;
  var pending = {};                                     // Item ID -> { field: new value }
  var st = { q: "", status: "for_sale", owner: "", mine: false, sort: "site", dir: -1 };
  var mq = window.matchMedia("(min-width: 760px)"), wide = mq.matches;

  // ---------- helpers ----------
  function el(tag, cls, text) {
    var e = document.createElement(tag); if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = String(text); return e;
  }
  function money(v) {
    if (v === null || v === undefined || v === "") return "—"; v = +v;
    return v === Math.round(v) ? "$" + v.toLocaleString() : "$" + v.toFixed(2);
  }
  function val(r, f) { var p = pending[r.id]; return p && Object.prototype.hasOwnProperty.call(p, f) ? p[f] : r[f]; }
  function changed(r, f) { var p = pending[r.id]; return !!(p && Object.prototype.hasOwnProperty.call(p, f)); }
  function nChanges() { var n = 0; for (var id in pending) n += Object.keys(pending[id]).length; return n; }
  function show(v, f) { return f === "yours" ? money(v) : (f === "sold" || f === "onsite") ? (v ? "Yes" : "No") : (v || "(blank)"); }
  var toastTimer;
  function toast(msg) {
    var t = $("#toast"); if (!t) return; t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 5000);
  }

  // ---------- the one place a change is recorded: by Item ID ----------
  function setField(id, f, v) {
    var r = byId[id]; if (!r) return;
    if (f === "yours") { v = String(v).replace(/[$,\s]/g, ""); v = v === "" ? null : (isFinite(+v) && +v >= 0 ? Math.round(+v * 100) / 100 : r.yours); }
    if (f === "notes" || f === "better") v = String(v || "").trim();
    var same = (v === r[f]) || ((v === null || v === "") && (r[f] === null || r[f] === ""));
    if (same) { if (pending[id]) { delete pending[id][f]; if (!Object.keys(pending[id]).length) delete pending[id]; } }
    else { pending[id] = pending[id] || {}; pending[id][f] = v; }
    bar();
  }

  // ---------- filter + sort (view only) ----------
  function sortVal(r, k) {
    if (k === "yours") { var y = val(r, "yours"); return y === null || y === "" ? null : +y; }
    if (k === "site" || k === "ours") return r[k] === null || r[k] === undefined ? null : +r[k];
    if (k === "name") return (val(r, "better") || r.name || "").toLowerCase();
    return (r[k] === null || r[k] === undefined) ? "" : String(r[k]).toLowerCase();
  }
  function apply() {
    var q = st.q.toLowerCase().trim();
    view = rows.filter(function (r) {
      if (st.status !== "all" && r.status !== st.status) return false;
      if (st.owner && r.owner !== st.owner) return false;
      if (st.mine && !pending[r.id] && r.yours === null && !r.notes && !r.better) return false;
      if (q && (r.id + " " + r.name + " " + r.sub + " " + (r.better || "")).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var k = st.sort, d = st.dir;
    view.sort(function (a, b) {
      var x = sortVal(a, k), y = sortVal(b, k);
      if (x === null && y === null) return a.id < b.id ? -1 : 1;
      if (x === null) return 1; if (y === null) return -1;          // blanks always last
      if (x < y) return -d; if (x > y) return d; return a.id < b.id ? -1 : 1;
    });
    var words = { site: "On site price", ours: "Our price", yours: "Your price", name: "Name", id: "Item ID",
                  grade: "Grade", owner: "Owner", sold: "Sold", onsite: "On site", notes: "Notes" };
    $("#eg-count").textContent = view.length.toLocaleString() + " cards · sorted by " + (words[k] || k) +
      (d < 0 ? " ↓" : " ↑") + " · sorting never moves a change to another card";
    render(true);
  }

  // ---------- render ----------
  var hasOurs = true;                                   // the static preview carries no engine price
  var COLS = [["id", "Item ID"], ["name", "Card"], ["grade", "Grade"], ["owner", "Owner"], ["ours", "Our price", "num"],
              ["yours", "Your price", "num"], ["site", "On site $", "num"], ["sold", "Sold", "c"], ["onsite", "On site", "c"],
              ["notes", "Notes"]];
  function render(reset) {
    if (reset) {
      shown = 0; root.textContent = "";
      if (wide) {
        var t = el("table", "eg"), th = el("thead"), tr = el("tr");
        COLS.forEach(function (c) {
          if (c[0] === "ours" && !hasOurs) return;
          var h = el("th", c[2] || ""), b = el("button", "eg-sort", c[1]); b.type = "button";
          b.setAttribute("data-sort", c[0]);
          if (st.sort === c[0]) { b.className += " on"; b.textContent = c[1] + (st.dir < 0 ? " ↓" : " ↑"); }
          h.appendChild(b); tr.appendChild(h);
        });
        th.appendChild(tr); t.appendChild(th); t.appendChild(el("tbody")); root.appendChild(t);
      } else {
        root.appendChild(el("div", "list eg-list"));
      }
    }
    var host = wide ? $("tbody", root) : $(".eg-list", root);
    var end = Math.min(view.length, shown + CHUNK);
    for (var i = shown; i < end; i++) host.appendChild(wide ? trFor(view[i]) : rowFor(view[i]));
    shown = end;
    if (!view.length) host.appendChild(el(wide ? "tr" : "div", "empty", "No cards match."));
  }
  function trFor(r) {
    var tr = el("tr"); tr.setAttribute("data-id", r.id);
    tr.appendChild(el("td", "eg-id", r.id));
    var c = el("td", "eg-card"), n = el("div", "rn" + (changed(r, "better") ? " chg" : ""), val(r, "better") || r.name);
    n.setAttribute("data-edit", "better"); n.title = "Click to give it a better name";
    c.appendChild(n); c.appendChild(el("div", "rs", r.sub + (r.cond && !r.grade ? " · " + r.cond : ""))); tr.appendChild(c);
    tr.appendChild(el("td", "", r.grade || "Raw"));
    tr.appendChild(el("td", "", r.owner));
    if (hasOurs) tr.appendChild(el("td", "num dim", money(r.ours)));
    var y = el("td", "num eg-ed" + (changed(r, "yours") ? " chg" : ""), val(r, "yours") === null ? "add" : money(val(r, "yours")));
    if (val(r, "yours") === null) y.className += " ph";
    y.setAttribute("data-edit", "yours"); tr.appendChild(y);
    tr.appendChild(el("td", "num", r.status === "sold" ? "Sold" : money(r.site)));
    ["sold", "onsite"].forEach(function (f) {
      var td = el("td", "c" + (changed(r, f) ? " chg" : "")), cb = el("input"); cb.type = "checkbox";
      cb.checked = !!val(r, f); cb.setAttribute("data-tick", f); cb.setAttribute("aria-label", LABEL[f] + " " + r.id);
      td.appendChild(cb); tr.appendChild(td);
    });
    var no = el("td", "eg-ed eg-notes" + (changed(r, "notes") ? " chg" : "") + (val(r, "notes") ? "" : " ph"), val(r, "notes") || "add");
    no.setAttribute("data-edit", "notes"); tr.appendChild(no);
    return tr;
  }
  function rowFor(r) {
    var a = el("button", "row eg-row" + (pending[r.id] ? " chg" : "")); a.type = "button"; a.setAttribute("data-id", r.id);
    if (r.img) { var im = el("img", "thumb"); im.src = r.img; im.alt = ""; im.loading = "lazy"; a.appendChild(im); }
    else a.appendChild(el("span", "thumb ph"));
    var t = el("div", "rt");
    t.appendChild(el("div", "rn", val(r, "better") || r.name));
    t.appendChild(el("div", "rs", r.sub + (r.grade ? " · " + r.grade : "")));
    var tags = [r.id, r.owner]; if (val(r, "sold")) tags.push("SOLD ticked"); if (val(r, "notes")) tags.push("📝");
    t.appendChild(el("div", "rs dim", tags.join(" · "))); a.appendChild(t);
    var p = el("div", "rp", r.status === "sold" ? "Sold" : money(r.site));
    if (val(r, "yours") !== null) p.appendChild(el("small", "eg-yours", "yours " + money(val(r, "yours"))));
    else if (hasOurs) p.appendChild(el("small", "", "ours " + money(r.ours)));
    a.appendChild(p);
    return a;
  }
  function redraw(id) {                                    // swap one row in place, keep scroll
    var old = root.querySelector('[data-id="' + id + '"]'); if (!old) return;
    old.parentNode.replaceChild(wide ? trFor(byId[id]) : rowFor(byId[id]), old);
  }

  // ---------- editing ----------
  function inlineEdit(td, id, f) {
    if (td.querySelector("input")) return;
    var r = byId[id], inp = el("input", "eg-in"); var v = val(r, f);
    inp.value = v === null || v === undefined ? "" : String(v);
    if (f === "yours") { inp.inputMode = "decimal"; inp.placeholder = money(r.ours); }
    td.textContent = ""; td.appendChild(inp); inp.focus(); inp.select();
    var done = false;
    function finish(save) { if (done) return; done = true; if (save) setField(id, f, inp.value); redraw(id); }
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") finish(false);
    });
    inp.addEventListener("blur", function () { finish(true); });
  }
  var editing = null;
  function openEditor(id) {
    var r = byId[id], dlg = $("#eg-ed"); editing = id;
    $("#eg-ed-name").textContent = val(r, "better") || r.name;
    $("#eg-ed-sub").textContent = r.id + " · " + r.sub + (r.grade ? " · " + r.grade : "") + (hasOurs ? " · our price " + money(r.ours) : "") +
      " · on site " + (r.status === "sold" ? "sold" : money(r.site));
    var y = val(r, "yours"); $("#eg-f-yours").value = y === null ? "" : y;
    $("#eg-f-better").value = val(r, "better") || ""; $("#eg-f-notes").value = val(r, "notes") || "";
    $("#eg-f-sold").checked = !!val(r, "sold"); $("#eg-f-onsite").checked = !!val(r, "onsite");
    dlg.returnValue = "";                                 // Escape must never re-use an old "ok"
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
  }
  $("#eg-ed-cancel").addEventListener("click", function () { $("#eg-ed").close("cancel"); });
  $("#eg-ed").addEventListener("close", function () {
    if (this.returnValue === "ok" && editing) {
      setField(editing, "yours", $("#eg-f-yours").value); setField(editing, "better", $("#eg-f-better").value);
      setField(editing, "notes", $("#eg-f-notes").value); setField(editing, "sold", $("#eg-f-sold").checked);
      setField(editing, "onsite", $("#eg-f-onsite").checked); redraw(editing);
    }
    editing = null;
  });

  root.addEventListener("click", function (e) {
    var s = e.target.closest("[data-sort]");
    if (s) { var k = s.getAttribute("data-sort"); st.dir = st.sort === k ? -st.dir : (k === "name" || k === "id" ? 1 : -1);
      st.sort = k; syncSortSelect(); apply(); return; }
    var ed = e.target.closest("[data-edit]");
    if (ed && wide) { inlineEdit(ed, ed.closest("tr").getAttribute("data-id"), ed.getAttribute("data-edit")); return; }
    var row = e.target.closest(".eg-row");
    if (row) openEditor(row.getAttribute("data-id"));
  });
  root.addEventListener("change", function (e) {
    var cb = e.target.closest("[data-tick]"); if (!cb) return;
    var id = cb.closest("tr").getAttribute("data-id"); setField(id, cb.getAttribute("data-tick"), cb.checked); redraw(id);
  });

  // ---------- pending changes bar + review ----------
  function bar() {
    var n = nChanges(), b = $("#eg-bar"); b.hidden = !n;
    $("#eg-bar-n").textContent = n + (n === 1 ? " change" : " changes") + " · not saved yet";
  }
  $("#eg-discard").addEventListener("click", function () {
    var ids = Object.keys(pending); pending = {}; bar(); ids.forEach(redraw); toast("Changes discarded.");
  });
  $("#eg-review").addEventListener("click", function () {
    var ol = $("#eg-rev-list"); ol.textContent = "";
    Object.keys(pending).sort().forEach(function (id) {
      var r = byId[id];
      Object.keys(pending[id]).forEach(function (f) {
        var li = el("li"); li.appendChild(el("b", "", id + " · " + (r.better || r.name)));
        li.appendChild(el("div", "rs", LABEL[f] + ": " + show(r[f], f) + " → " + show(pending[id][f], f)));
        ol.appendChild(li);
      });
    });
    var d = $("#eg-rev"); d.returnValue = ""; if (d.showModal) d.showModal(); else d.setAttribute("open", "");
  });
  $("#eg-rev").addEventListener("close", function () {
    if (this.returnValue !== "save") return;
    var n = nChanges();
    toast("Mock: nothing was saved. The real app would write " + n + (n === 1 ? " change" : " changes") +
          " to your sheet, each by its Item ID.");
  });

  // ---------- controls ----------
  function syncSortSelect() {
    var s = $("#eg-sort"), want = st.sort + ":" + st.dir, has = false;
    for (var i = 0; i < s.options.length; i++) if (s.options[i].value === want) has = true;
    if (has) s.value = want;
  }
  var qt;
  $("#eg-q").addEventListener("input", function () { var v = this.value; clearTimeout(qt); qt = setTimeout(function () { st.q = v; apply(); }, 120); });
  $("#eg-search").addEventListener("submit", function (e) { e.preventDefault(); });
  $("#eg-sort").addEventListener("change", function () { var p = this.value.split(":"); st.sort = p[0]; st.dir = +p[1]; apply(); });
  $("#eg-status").addEventListener("click", function (e) {
    var c = e.target.closest("[data-status]");
    if (c) { st.status = c.getAttribute("data-status");
      Array.prototype.forEach.call(this.querySelectorAll("[data-status]"), function (x) { x.classList.toggle("on", x === c); });
      apply(); return; }
    if (e.target.closest("#eg-mine")) { st.mine = !st.mine; var m = $("#eg-mine"); m.classList.toggle("on", st.mine);
      m.setAttribute("aria-pressed", st.mine ? "true" : "false"); apply(); }
  });
  $("#eg-owner").addEventListener("change", function () { st.owner = this.value; apply(); });
  function onMode() { if (mq.matches !== wide) { wide = mq.matches; render(true); } }
  if (mq.addEventListener) mq.addEventListener("change", onMode); else if (mq.addListener) mq.addListener(onMode);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { if (es[0].isIntersecting && shown < view.length) render(false); },
      { rootMargin: "600px" }).observe($("#eg-more"));
  }
  window.addEventListener("beforeunload", function (e) { if (nChanges()) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- load ----------
  fetch(root.getAttribute("data-src"), { credentials: "same-origin" }).then(function (r) {
    if (!r.ok) throw new Error(r.status); return r.json();
  }).then(function (d) {
    rows = d.rows.map(function (a) { var o = {}; K.forEach(function (k, i) { o[k] = a[i]; }); return o; });
    rows.forEach(function (r) { byId[r.id] = r; });
    hasOurs = rows.some(function (r) { return r.ours !== null && r.ours !== undefined; });
    var owners = {}; rows.forEach(function (r) { if (r.owner) owners[r.owner] = 1; });
    Object.keys(owners).sort().forEach(function (o) { var op = el("option", "", o); op.value = o; $("#eg-owner").appendChild(op); });
    apply();
  }).catch(function () { $("#eg-count").textContent = "Couldn't load the cards. Refresh to try again."; });
})();
