/* vendorkit storefront behaviour: grid, search, filters, card sheet, sticker deep links.
   Deep links (the printed-sticker contract): #<link_key> of a card, a sold tombstone, or an OLD
   key in `aliases` all open the right card. Text from data only ever goes in via textContent. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var D = { cards: [], byId: {}, byKey: {}, aliases: {} }, view = [], shown = 0, PAGE = 40;
  var cfgEl = $("#cfg");

  function money(v) { if (v === null || v === undefined) return ""; v = +v;
    return v === Math.round(v) ? "$" + v.toLocaleString() : "$" + v.toFixed(2); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text; return e; }

  function tile(c) {
    var a = el("a", "tile"); a.href = "#" + (c.k || c.id);
    var art = el("span", "art");
    if (c.i) { var im = el("img"); im.src = c.t || c.i; im.alt = c.n; im.loading = "lazy"; im.decoding = "async"; art.appendChild(im); }
    else art.appendChild(el("span", "noimg"));
    var badge = c.g || (c.c && c.c !== "Near Mint" ? c.c : "");
    if (badge) art.appendChild(el("b", "badge", badge));
    a.appendChild(art); a.appendChild(el("span", "tn", c.n)); a.appendChild(el("span", "ts", c.s));
    var p = el("span", "tp", c.st === "sold" ? "Sold" : money(c.p));
    if (c.w) { var w = el("s", "was", money(c.w)); p.appendChild(document.createTextNode(" ")); p.appendChild(w); }
    a.appendChild(p);
    return a;
  }

  // ---------- grid ----------
  function applyFilters() {
    var q = ($("#q").value || "").trim().toLowerCase(), era = $("#era").value, kind = $("#kind").value, sort = $("#sort").value;
    var words = q ? q.split(/\s+/) : [];
    view = D.cards.filter(function (c) {
      if (c.st !== "for_sale") return false;
      if (era && c.e !== era) return false;
      if (kind === "slab" && !c.g) return false;
      if (kind === "raw" && c.g) return false;
      if (!words.length) return true;
      var hay = (c.n + " " + c.s + " " + c.id + " " + (c.g || "") + " " + (c.v || "")).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    view.sort(function (a, b) {
      if (sort === "pa") return (a.p || 0) - (b.p || 0);
      if (sort === "nm") return a.n.localeCompare(b.n);
      return (b.p || 0) - (a.p || 0);
    });
    shown = 0; $("#grid").textContent = ""; more();
    $("#count").textContent = view.length.toLocaleString() + (view.length === 1 ? " card" : " cards") + (q || era || kind ? " match" : " for sale");
  }
  function more() {
    var g = $("#grid"), next = view.slice(shown, shown + PAGE);
    if (!view.length) g.appendChild(el("div", "empty", "No cards match. Try fewer words or another era."));
    next.forEach(function (c) { g.appendChild(tile(c)); });
    shown += next.length; $("#more").hidden = shown >= view.length;
  }

  // ---------- card sheet ----------
  function similar(c) {
    return D.cards.filter(function (x) { return x.st === "for_sale" && x.id !== c.id && x.i && (x.s.split(" · ")[0] === c.s.split(" · ")[0] || x.e === c.e); })
      .sort(function (a, b) { return (b.s.split(" · ")[0] === c.s.split(" · ")[0]) - (a.s.split(" · ")[0] === c.s.split(" · ")[0]) || (b.p || 0) - (a.p || 0); })
      .slice(0, 10);
  }
  function openCard(c) {
    var body = $("#sheetbody"); body.textContent = "";
    var art = el("div", "sh-art");
    if (c.i) { var im = el("img"); im.src = c.i; im.alt = c.n; art.appendChild(im); }
    body.appendChild(art);
    var h = el("h2", "sh-name", c.n); h.id = "sh-name"; body.appendChild(h);
    body.appendChild(el("p", "sh-sub", c.s));
    var chips = el("div", "chips");
    [c.g || c.c, c.v, c.l === "JP" ? "Japanese" : ""].forEach(function (t) { if (t) chips.appendChild(el("span", "chip", t)); });
    body.appendChild(chips);
    if (c.st === "sold") {
      body.appendChild(el("div", "soldmsg", "This one found a new home. Here are a few like it."));
    } else {
      var pr = el("div", "sh-price"); pr.appendChild(el("b", "", money(c.p)));
      if (c.w) pr.appendChild(el("s", "was", "was " + money(c.w)));
      body.appendChild(pr);
      body.appendChild(el("p", "sh-src", "Priced from real recent sales · Sticker " + c.id));
      var btns = el("div", "btns"), want = el("button", "cta", "I want this card"), share = el("button", "ghost", "Share");
      btns.appendChild(want); btns.appendChild(share); body.appendChild(btns);
      var form = el("form", "buy"); form.hidden = true;
      var who = el("input"); who.placeholder = "Your phone or email"; who.required = true; who.autocomplete = "email";
      var note = el("textarea"); note.placeholder = "Anything we should know? (optional)"; note.rows = 2;
      var send = el("button", "cta", "Send request"); send.type = "submit";
      var dev = cfgEl && cfgEl.getAttribute("data-buy-note");
      form.appendChild(who); form.appendChild(note); form.appendChild(send);
      if (dev) form.appendChild(el("p", "note", dev));
      body.appendChild(form);
      want.addEventListener("click", function () { form.hidden = false; who.focus(); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        form.textContent = "";
        form.appendChild(el("p", "ok", dev ? "Looks good. (Dev preview: nothing was sent.)" : "Request sent. We'll be in touch soon."));
      });
      share.addEventListener("click", function () {
        var url = location.origin + location.pathname.replace(/index\.html$/, "") + "card/" + c.id + "/";
        if (navigator.share) navigator.share({ title: c.n, url: url }).catch(function () {});
        else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { share.textContent = "Link copied"; });
      });
    }
    var sim = similar(c);
    if (sim.length) {
      var like = el("div", "like"); like.appendChild(el("h3", "", "More like this"));
      var row = el("div", "row"); sim.forEach(function (s) { row.appendChild(tile(s)); }); like.appendChild(row); body.appendChild(like);
    }
    $("#sheet").hidden = false; document.body.style.overflow = "hidden"; $("#sheet .sheet-in").scrollTop = 0;
  }
  function closeCard() { $("#sheet").hidden = true; document.body.style.overflow = ""; }

  function resolve(key) {
    if (!key) return null;
    var c = D.byKey[key] || D.byId[key];
    if (!c && D.aliases[key]) c = D.byKey[D.aliases[key]];          // an old printed sticker
    return c || null;
  }
  function route() {
    var key = decodeURIComponent(location.hash.slice(1));
    if (!key || key === "shop" || key === "headliners" || key === "new" || key === "trending" || key === "drops" || key === "binder") { closeCard(); return; }
    var c = resolve(key);
    if (c) openCard(c); else closeCard();
  }

  // ---------- wire up ----------
  $("#close").addEventListener("click", function () { history.pushState("", "", location.pathname + location.search); closeCard(); });
  $("#sheet").addEventListener("click", function (e) { if (e.target.id === "sheet") $("#close").click(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("#sheet").hidden) $("#close").click(); });
  window.addEventListener("hashchange", route);
  var timer;
  $("#q").addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () {
    applyFilters(); if ($("#q").value) $("#shop").scrollIntoView({ behavior: "smooth" }); }, 180); });
  $(".find").addEventListener("submit", function (e) { e.preventDefault(); applyFilters(); $("#shop").scrollIntoView({ behavior: "smooth" }); });
  ["#era", "#kind", "#sort"].forEach(function (s) { $(s).addEventListener("change", applyFilters); });
  $("#more").addEventListener("click", more);
  document.addEventListener("click", function (e) {
    var era = e.target.closest("[data-era]"); if (!era) return;
    $("#era").value = era.getAttribute("data-era"); applyFilters();
  });

  fetch("catalog.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (j) {
    D.cards = j.cards; D.aliases = j.aliases || {};
    j.cards.forEach(function (c) { D.byId[c.id] = c; if (c.k) D.byKey[c.k] = c; });
    applyFilters(); route();
  });
})();
