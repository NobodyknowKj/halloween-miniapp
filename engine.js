/* موتور بازی «ساختمان شماره ۱۴» — منطق خالص، بدون هیچ وابستگی به صفحه.
 *
 * همان قوانین نسخه‌ی تلگرامی (bot.py) این‌جا هم برقرار است:
 *  - هر انتخاب دقیقاً یک بار و فقط روی صحنه‌ی فعلی اعمال می‌شود.
 *  - ایندکس نامعتبر، انتخاب بعد از پایان و انتخاب روی صحنه‌ی تمام‌شده رد می‌شود.
 *  - مقصدهای مجازی (*_check) همان لحظه بر اساس آمار/آیتم به پایان واقعی تبدیل می‌شوند
 *    و هرگز به‌عنوان صحنه ذخیره نمی‌شوند.
 *  - پایان دقیقاً لحظه‌ی رسیدن ثبت می‌شود، نه موقع نمایش.
 *
 * در مرورگر: window.GameEngine — در Node (برای تست‌ها): module.exports
 */
(function (global) {
  "use strict";

  var VIRTUAL = { ending_together_check: 1, ending_truth_check: 1 };
  var ITEMS = { diary: "📓 دفترچه‌ی سارا" };

  function defaultStats() {
    return { courage: 0, empathy: 0, sanity: 2 };
  }

  function createState() {
    return {
      node: "start",
      stats: defaultStats(),
      items: [],
      endings: [],
      plays: 0,
      step: 0,
      run: 0,
    };
  }

  function normalizeState(data, raw) {
    var s = createState();
    if (!raw || typeof raw !== "object") return s;
    if (raw.stats && typeof raw.stats === "object") {
      Object.keys(s.stats).forEach(function (k) {
        var v = parseInt(raw.stats[k], 10);
        if (!isNaN(v)) s.stats[k] = v;
      });
    }
    if (Array.isArray(raw.items)) {
      s.items = raw.items.filter(function (it) { return it in ITEMS; });
    }
    var validEndings = {};
    Object.keys(data.nodes).forEach(function (nid) {
      if (data.nodes[nid].isEnding) validEndings[nid] = 1;
    });
    if (Array.isArray(raw.endings)) {
      s.endings = raw.endings.filter(function (e) { return e in validEndings; });
    }
    s.plays = Math.max(0, parseInt(raw.plays, 10) || 0);
    s.step = Math.max(0, parseInt(raw.step, 10) || 0);
    s.run = Math.max(0, parseInt(raw.run, 10) || 0);
    var node = raw.node || "start";
    if (VIRTUAL[node]) node = resolveVirtual(data, node, s.stats, s.items);
    s.node = data.nodes[node] ? node : "start";
    return s;
  }

  function resetRun(state) {
    state.node = "start";
    state.stats = defaultStats();
    state.items = [];
    state.step = 0;
    state.run += 1;
    state.plays += 1;
    return state;
  }

  function resolveVirtual(data, target, stats, items) {
    if (target === "ending_together_check") {
      return (stats.empathy || 0) >= (data.togetherEmpathyNeeded || 3)
        ? "ending_together"
        : "ending_together_fail";
    }
    if (target === "ending_truth_check") {
      return items.indexOf("diary") >= 0 ? "ending_truth" : "ending_truth_fail";
    }
    return target;
  }

  /* یک انتخاب را اعمال می‌کند. برمی‌گرداند: {ok:true} یا {ok:false, reason}
   * reason: "ended" | "bad_index" | "bad_target"
   * تا وقتی همه‌ی بررسی‌ها رد نشده‌اند، هیچ چیزی در وضعیت تغییر نمی‌کند. */
  function applyChoice(data, state, choiceIndex) {
    var node = data.nodes[state.node];
    if (!node || node.isEnding) return { ok: false, reason: "ended" };
    if (typeof choiceIndex !== "number" || !isFinite(choiceIndex) ||
        Math.floor(choiceIndex) !== choiceIndex ||
        choiceIndex < 0 || choiceIndex >= node.choices.length) {
      return { ok: false, reason: "bad_index" };
    }
    var choice = node.choices[choiceIndex];
    var newStats = {};
    Object.keys(state.stats).forEach(function (k) { newStats[k] = state.stats[k]; });
    Object.keys(choice.effects || {}).forEach(function (k) {
      if (k in newStats) newStats[k] += choice.effects[k];
    });
    var newItems = state.items.slice();
    if (choice.item && (choice.item in ITEMS) && newItems.indexOf(choice.item) < 0) {
      newItems.push(choice.item);
    }
    var target = resolveVirtual(data, choice.next, newStats, newItems);
    if (!data.nodes[target]) return { ok: false, reason: "bad_target" };
    state.stats = newStats;
    state.items = newItems;
    state.node = target;
    state.step += 1;
    if (data.nodes[target].isEnding && state.endings.indexOf(target) < 0) {
      state.endings.push(target);
    }
    return { ok: true, target: target };
  }

  var api = {
    createState: createState,
    normalizeState: normalizeState,
    resetRun: resetRun,
    resolveVirtual: resolveVirtual,
    applyChoice: applyChoice,
    ITEMS: ITEMS,
    VIRTUAL: VIRTUAL,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GameEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
