/* ساختمان شماره ۱۴ — رابط مینی‌اپ تلگرام
 * منطق بازی در engine.js است؛ این فایل فقط نمایش، صدا و تلگرام را مدیریت می‌کند. */
(function () {
  "use strict";

  var DATA = window.STORY_DATA;
  var Engine = window.GameEngine;
  var tg = (window.Telegram && window.Telegram.WebApp) || null;

  var SAVE_KEY = "b14_save_v1";
  var SOUND_KEY = "b14_sound";
  var IMG = function (name) { return "assets/img/" + name + ".jpg"; };
  var KNOCK_NODES = { alone: 1, hide: 1, final_choice: 1, morning_room: 1 };

  var $ = function (id) { return document.getElementById(id); };
  var screens = { intro: $("screen-intro"), game: $("screen-game"), endings: $("screen-endings") };

  var state = loadState();
  var soundOn = loadSound();
  var transitioning = false;
  var activeImg = "a";
  var lastStats = null;

  /* ── ابزار ── */
  function faNum(v) {
    return String(v).replace(/\d/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[d]; });
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function formatText(raw) {
    var html = escapeHtml(raw).replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
    return html.split(/\n\s*\n/).map(function (p) {
      return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }
  function haptic(kind) {
    try {
      if (!tg || !tg.HapticFeedback) return;
      if (kind === "choice") tg.HapticFeedback.impactOccurred("light");
      else if (kind === "ending") tg.HapticFeedback.notificationOccurred("success");
      else if (kind === "tap") tg.HapticFeedback.selectionChanged();
    } catch (e) { /* بدون هپتیک هم بازی ادامه دارد */ }
  }

  /* ── ذخیره ── */
  function loadState() {
    try {
      var raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      return Engine.normalizeState(DATA, raw);
    } catch (e) {
      return Engine.createState();
    }
  }
  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function loadSound() {
    try { return localStorage.getItem(SOUND_KEY) === "1"; } catch (e) { return false; }
  }
  function saveSound() {
    try { localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0"); } catch (e) {}
  }

  /* ── صدا ── */
  function play(id) {
    var el = $(id);
    if (!el) return;
    try {
      el.currentTime = 0;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function startAmbient() {
    if (!soundOn) return;
    var el = $("audio-ambient");
    try {
      el.volume = 0.55;
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function stopAmbient() {
    try { $("audio-ambient").pause(); } catch (e) {}
  }
  function refreshSoundIcon() {
    $("btn-sound").textContent = soundOn ? "🔊" : "🔇";
  }

  /* ── صفحه‌ها ── */
  function show(name) {
    Object.keys(screens).forEach(function (k) {
      screens[k].classList.toggle("hidden", k !== name);
    });
    try {
      if (tg && tg.BackButton) {
        if (name === "intro") tg.BackButton.hide(); else tg.BackButton.show();
      }
    } catch (e) {}
    window.scrollTo(0, 0);
  }

  function updateStats(animate) {
    var map = { courage: "stat-courage", empathy: "stat-empathy", sanity: "stat-sanity" };
    var icons = { courage: "🦁", empathy: "❤️", sanity: "🧠" };
    Object.keys(map).forEach(function (k) {
      var el = $(map[k]);
      el.textContent = icons[k] + " " + faNum(state.stats[k]);
      if (animate && lastStats && lastStats[k] !== state.stats[k]) {
        el.classList.remove("bump");
        void el.offsetWidth;
        el.classList.add("bump");
      }
    });
    $("stat-item").classList.toggle("hidden", state.items.indexOf("diary") < 0);
    lastStats = { courage: state.stats.courage, empathy: state.stats.empathy, sanity: state.stats.sanity };
  }

  /* ── رندر صحنه ── */
  function setSceneImage(imgName) {
    var next = activeImg === "a" ? "b" : "a";
    var nextEl = $("scene-img-" + next);
    var curEl = $("scene-img-" + activeImg);
    var src = IMG(imgName);
    if (curEl.getAttribute("src") === src) return;
    nextEl.src = src;
    nextEl.classList.remove("faded");
    curEl.classList.add("faded");
    activeImg = next;
  }

  function render() {
    var node = DATA.nodes[state.node];
    setSceneImage(node.img);
    $("scene-step").textContent = "🚪 گام " + faNum(state.step + 1) +
      (state.items.indexOf("diary") >= 0 ? " · 🎒 دفترچه‌ی سارا" : "");
    $("scene-text").innerHTML = formatText(node.text);
    updateStats(true);

    var choicesBox = $("choices");
    choicesBox.innerHTML = "";
    $("ending-banner").classList.add("hidden");
    $("ending-actions").classList.add("hidden");

    if (node.isEnding) {
      var banner = $("ending-banner");
      banner.textContent = node.endingTitle || "پایان";
      banner.classList.remove("hidden");
      $("ending-actions").classList.remove("hidden");
      $("btn-send-result").classList.toggle("hidden", !tg);
      return;
    }
    node.choices.forEach(function (choice, idx) {
      var btn = document.createElement("button");
      btn.className = "choice-btn";
      btn.textContent = choice.text;
      btn.addEventListener("click", function () { onChoice(idx); });
      choicesBox.appendChild(btn);
    });
  }

  function onChoice(idx) {
    if (transitioning) return;           // ضد دابل‌تپ: یک انتخاب، یک گام
    transitioning = true;
    if (soundOn) play("audio-click");
    haptic("choice");
    var res = Engine.applyChoice(DATA, state, idx);
    if (!res.ok) { transitioning = false; return; }
    saveState();
    setTimeout(function () {
      render();
      var node = DATA.nodes[state.node];
      if (node.isEnding) {
        if (soundOn) play("audio-bell");
        haptic("ending");
      } else if (KNOCK_NODES[state.node] && soundOn) {
        setTimeout(function () { play("audio-knock"); }, 500);
      }
      transitioning = false;
    }, 240);
  }

  /* ── شروع و ادامه ── */
  function startNewGame() {
    Engine.resetRun(state);
    saveState();
    $("stats-bar").classList.remove("hidden");
    show("game");
    render();
    startAmbient();
    if (soundOn) setTimeout(function () { play("audio-knock"); }, 900);
  }
  function continueGame() {
    $("stats-bar").classList.remove("hidden");
    show("game");
    render();
    startAmbient();
  }
  function refreshIntro() {
    $("intro-endings-count").textContent = faNum(state.endings.length) + "/۸";
    var midGame = !DATA.nodes[state.node].isEnding && state.step > 0;
    $("btn-continue").classList.toggle("hidden", !midGame);
    $("btn-start").textContent = state.plays > 0 ? "🔄 بازی تازه از اول" : "🔑 کلید را بچرخان و شروع کن";
  }

  /* ── گالری پایان‌ها ── */
  function renderEndings() {
    var all = DATA.endingsList.concat(DATA.extraEndings);
    $("endings-summary").textContent =
      "تا حالا " + faNum(state.endings.length) + " پایان از ۸ پایان را پیدا کرده‌ای. " +
      (state.endings.length >= 8 ? "همه‌ی پایان‌ها را پیدا کردی! 🎉" : "برای بقیه، دوباره بازی کن و انتخاب‌های دیگری بکن.");
    var grid = $("endings-grid");
    grid.innerHTML = "";
    all.forEach(function (pair) {
      var eid = pair[0], title = pair[1];
      var found = state.endings.indexOf(eid) >= 0;
      var card = document.createElement("div");
      card.className = "ending-card" + (found ? "" : " locked");
      card.innerHTML =
        '<img src="' + IMG(DATA.nodes[eid].img) + '" alt="">' +
        '<span class="mark">' + (found ? "✅" : "🔒") + "</span>" +
        '<div class="cap">' + (found ? escapeHtml(title) : "❓ هنوز پیدا نشده") + "</div>";
      grid.appendChild(card);
    });
  }

  /* ── ارسال نتیجه به بات ── */
  function sendResult() {
    if (!tg) return;
    var node = DATA.nodes[state.node];
    var payload = JSON.stringify({
      type: "ending",
      ending: state.node,
      title: node.endingTitle || "",
      stats: state.stats,
      items: state.items,
      plays: state.plays,
      endingsFound: state.endings.length,
    });
    try {
      tg.sendData(payload);
    } catch (e) {
      try {
        tg.showAlert("ثبت در چت فقط وقتی کار می‌کند که بازی را با دکمه‌ی «بازی» در چت بات باز کرده باشی.");
      } catch (e2) {}
    }
  }

  /* ── رویدادها ── */
  $("btn-start").addEventListener("click", function () { haptic("tap"); startNewGame(); });
  $("btn-continue").addEventListener("click", function () { haptic("tap"); continueGame(); });
  $("btn-again").addEventListener("click", function () { haptic("tap"); startNewGame(); });
  var endingsReturnTo = "intro";
  $("btn-endings").addEventListener("click", function () { endingsReturnTo = "intro"; renderEndings(); show("endings"); });
  $("btn-endings2").addEventListener("click", function () { endingsReturnTo = "game"; renderEndings(); show("endings"); });
  $("btn-back").addEventListener("click", function () {
    refreshIntro();
    show(endingsReturnTo);
  });
  $("btn-home").addEventListener("click", function () { refreshIntro(); show("intro"); });
  $("btn-send-result").addEventListener("click", sendResult);
  $("btn-sound").addEventListener("click", function () {
    soundOn = !soundOn;
    saveSound();
    refreshSoundIcon();
    if (soundOn) { startAmbient(); play("audio-click"); }
    else stopAmbient();
  });
  document.addEventListener("pointerdown", function once() {
    startAmbient();
    document.removeEventListener("pointerdown", once);
  });

  /* ── تلگرام ── */
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor("#14100d");
      if (tg.BackButton) {
        tg.BackButton.onClick(function () { refreshIntro(); show("intro"); });
      }
    } catch (e) {}
  }

  refreshSoundIcon();
  refreshIntro();
  show("intro");
})();
