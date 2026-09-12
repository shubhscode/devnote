// devnote docs interactions: theme, stars, spotlight, reveal, copy, tabs, mobile nav.
(function () {
  var root = document.documentElement;
  var REPO = "shubhscode/devnote";

  // Theme: stored pref wins, else OS.
  try {
    var saved = localStorage.getItem("devnote-theme");
    if (saved) root.setAttribute("data-theme", saved);
    else if (window.matchMedia("(prefers-color-scheme: light)").matches) root.setAttribute("data-theme", "light");
    else root.setAttribute("data-theme", "dark");
  } catch (e) { root.setAttribute("data-theme", "dark"); }

  function syncThemeIcon() {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.textContent = root.getAttribute("data-theme") === "light" ? "☾" : "☀";
      b.setAttribute("title", "Toggle theme (currently " + root.getAttribute("data-theme") + ")");
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-theme-toggle]");
    if (!t) return;
    var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    try { localStorage.setItem("devnote-theme", next); } catch (err) {}
    syncThemeIcon();
  });
  syncThemeIcon();

  // Mobile nav
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-burger]");
    if (!b) return;
    var links = document.querySelector("[data-nav-links]");
    if (links) links.classList.toggle("open");
  });

  // GitHub stars (all [data-stars] + [data-forks])
  function fmt(n) {
    if (n == null) return null;
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }
  fetch("https://api.github.com/repos/" + REPO)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      document.querySelectorAll("[data-stars]").forEach(function (el) { el.textContent = fmt(d.stargazers_count) || "—"; });
      document.querySelectorAll("[data-forks]").forEach(function (el) { el.textContent = fmt(d.forks_count) || "—"; });
    })
    .catch(function () { /* offline-safe: badges below still render */ });

  // Spotlight cards
  document.addEventListener("pointermove", function (e) {
    var card = e.target.closest && e.target.closest(".card.spot");
    if (!card) return;
    var r = card.getBoundingClientRect();
    card.style.setProperty("--mx", (e.clientX - r.left) + "px");
    card.style.setProperty("--my", (e.clientY - r.top) + "px");
  });

  // Reveal on scroll
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });

  // Copy buttons for <pre data-copy>
  document.querySelectorAll("pre[data-copy]").forEach(function (pre) {
    var btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", function () {
      var text = pre.innerText.replace(/\nCopy$/, "");
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "Copied ✓";
        setTimeout(function () { btn.textContent = "Copy"; }, 1400);
      });
    });
    pre.style.position = "relative";
    pre.appendChild(btn);
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-copy-text]");
    if (!b) return;
    navigator.clipboard.writeText(b.getAttribute("data-copy-text")).then(function () {
      var old = b.textContent; b.textContent = "Copied ✓";
      setTimeout(function () { b.textContent = old; }, 1400);
    });
  });

  // Tabs: [data-tabs] container, buttons [data-tab], panes [data-pane]
  document.querySelectorAll("[data-tabs]").forEach(function (box) {
    box.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tab]");
      if (!btn) return;
      box.querySelectorAll("[data-tab]").forEach(function (b) { b.classList.toggle("on", b === btn); });
      var scope = box.parentElement ? box.parentElement.parentElement : document;
      (scope.querySelectorAll("[data-pane]") || []).forEach(function (p) {
        p.hidden = p.getAttribute("data-pane") !== btn.getAttribute("data-tab");
      });
    });
  });

  // Footer year
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
