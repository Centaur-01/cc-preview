/* Share-page price: loaded at runtime from the catalog so a price-only update never leaves a stale
   number baked into ~2,500 static pages (PKM-023 gotcha). */
(function () {
  var id = document.body.getAttribute("data-id"), out = document.getElementById("price");
  fetch("../../catalog.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (j) {
    var c = j.cards.find(function (x) { return x.id === id; });
    if (!c) return;
    if (c.st === "sold") { out.textContent = "Sold"; return; }
    var v = +c.p; out.textContent = v === Math.round(v) ? "$" + v.toLocaleString() : "$" + v.toFixed(2);
  }).catch(function () {});
})();
