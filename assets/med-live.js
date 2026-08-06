/* med-live.js - the breath pacer for learn-meditation-with-phoebe
   A real, offline breathing pacer. Nothing here is simulated: the timing you
   see is the timing you breathe. Drop <div class="medbox" data-pattern="box"></div>
   on a page and this builds the whole tool inside it.

   Patterns are defined as phase lists: [name, seconds, scaleTarget].
   scaleTarget drives the circle: 1 = full inhale size, 0 = full exhale size. */

(function () {
  "use strict";

  var PATTERNS = {
    box: {
      label: "Box breathing",
      note: "4 in · 4 hold · 4 out · 4 hold. Even and steadying.",
      phases: [["Inhale", 4, 1], ["Hold", 4, 1], ["Exhale", 4, 0], ["Hold", 4, 0]]
    },
    relax: {
      label: "4-6 relaxing",
      note: "4 in · 6 out. Longer exhale - the gentlest place to start.",
      phases: [["Inhale", 4, 1], ["Exhale", 6, 0]]
    },
    coherent: {
      label: "Coherent ~5.5",
      note: "5.5 in · 5.5 out ≈ 5.5 breaths per minute, the resonance-breathing pace.",
      phases: [["Inhale", 5.5, 1], ["Exhale", 5.5, 0]]
    },
    fourseven: {
      label: "4-7-8",
      note: "4 in · 7 hold · 8 out. Strong exhale bias; skip the hold if dizzy.",
      phases: [["Inhale", 4, 1], ["Hold", 7, 1], ["Exhale", 8, 0]]
    }
  };

  var MINUTES = [1, 3, 5, 10];

  document.querySelectorAll(".medbox").forEach(function (box) {
    var initialAttr = box.getAttribute("data-pattern");
    var patternKey = (initialAttr !== null && PATTERNS[initialAttr]) ? initialAttr : "relax";
    var minsAttr = box.getAttribute("data-minutes");
    var sessionMins = (minsAttr !== null && !isNaN(parseInt(minsAttr, 10))) ? parseInt(minsAttr, 10) : 3;

    /* ----- build UI ----- */
    box.innerHTML =
      '<div class="med-head">' +
        '<span class="med-title">Breath pacer</span>' +
        '<span class="med-honest">real timer, real pacing - nothing simulated</span>' +
      '</div>' +
      '<div class="med-controls">' +
        '<div class="med-group med-patterns" role="group" aria-label="Breathing pattern"></div>' +
        '<div class="med-group med-minutes" role="group" aria-label="Session length"></div>' +
      '</div>' +
      '<p class="med-note"></p>' +
      '<div class="med-stage">' +
        '<div class="med-ring"><div class="med-circle"></div>' +
          '<div class="med-phase"><span class="med-phase-name">Ready</span><span class="med-phase-count"></span></div>' +
        '</div>' +
      '</div>' +
      '<div class="med-bottom">' +
        '<button type="button" class="btn primary med-start">Start</button>' +
        '<button type="button" class="btn med-reset">Reset</button>' +
        '<span class="med-clock">0:00</span>' +
        '<span class="med-breaths">0 breaths</span>' +
      '</div>';

    var patternWrap = box.querySelector(".med-patterns");
    var minutesWrap = box.querySelector(".med-minutes");
    var noteEl = box.querySelector(".med-note");
    var circle = box.querySelector(".med-circle");
    var phaseName = box.querySelector(".med-phase-name");
    var phaseCount = box.querySelector(".med-phase-count");
    var startBtn = box.querySelector(".med-start");
    var resetBtn = box.querySelector(".med-reset");
    var clockEl = box.querySelector(".med-clock");
    var breathsEl = box.querySelector(".med-breaths");

    Object.keys(PATTERNS).forEach(function (key) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "med-pill" + (key === patternKey ? " on" : "");
      b.textContent = PATTERNS[key].label;
      b.setAttribute("data-key", key);
      b.addEventListener("click", function () {
        patternKey = key;
        patternWrap.querySelectorAll(".med-pill").forEach(function (p) { p.classList.remove("on"); });
        b.classList.add("on");
        stop(true);
        noteEl.textContent = PATTERNS[key].note;
      });
      patternWrap.appendChild(b);
    });

    MINUTES.forEach(function (mn) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "med-pill" + (mn === sessionMins ? " on" : "");
      b.textContent = mn + " min";
      b.addEventListener("click", function () {
        sessionMins = mn;
        minutesWrap.querySelectorAll(".med-pill").forEach(function (p) { p.classList.remove("on"); });
        b.classList.add("on");
        stop(true);
      });
      minutesWrap.appendChild(b);
    });

    noteEl.textContent = PATTERNS[patternKey].note;

    /* ----- engine ----- */
    var running = false;
    var raf = null;
    var phaseIdx = 0;
    var phaseStart = 0;   /* performance.now() at phase start */
    var pausedElapsedInPhase = 0;
    var sessionElapsed = 0; /* accumulated ms across pauses */
    var sessionStamp = 0;   /* stamp of last resume */
    var breaths = 0;
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function fmtClock(ms) {
      var s = Math.floor(ms / 1000);
      return Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
    }

    function setCircle(scale) {
      /* scale 0..1 -> visual 0.45..1 */
      var v = 0.45 + 0.55 * scale;
      circle.style.transform = "scale(" + v + ")";
    }

    function currentPhases() { return PATTERNS[patternKey].phases; }

    /* step() is the whole engine: pure function of timestamps, safe to call
       from rAF (smooth, visible tab) AND from a fallback interval (hidden or
       throttled tab) - the clock and phases never freeze. Catches up across
       long gaps by advancing as many phases as actually elapsed. */
    function step(now) {
      if (!running) return;
      var phases = currentPhases();
      var ph = phases[phaseIdx];
      var dur = ph[1] * 1000;
      var inPhase = now - phaseStart;

      while (inPhase >= dur) {
        phaseStart += dur;
        inPhase -= dur;
        var prevIdx = phaseIdx;
        phaseIdx = (phaseIdx + 1) % phases.length;
        if (phaseIdx === 0 && prevIdx === phases.length - 1) {
          breaths++;
          breathsEl.textContent = breaths + (breaths === 1 ? " breath" : " breaths");
        }
        ph = phases[phaseIdx];
        dur = ph[1] * 1000;
      }

      phaseName.textContent = ph[0];
      phaseCount.textContent = Math.ceil((dur - inPhase) / 1000);

      /* animate circle toward the phase target */
      var prev = phases[(phaseIdx + phases.length - 1) % phases.length];
      var from = prev[2];
      var to = ph[2];
      var p = Math.min(inPhase / dur, 1);
      if (ph[0] === "Hold" || reduceMotion) {
        setCircle(to);
      } else {
        /* ease in-out */
        var eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        setCircle(from + (to - from) * eased);
      }

      /* session clock */
      var total = sessionElapsed + (now - sessionStamp);
      clockEl.textContent = fmtClock(total);
      if (total >= sessionMins * 60000) finish();
    }

    var fallback = null;

    function rafLoop(ts) {
      if (!running) return;
      step(ts);
      if (running) raf = requestAnimationFrame(rafLoop);
    }

    function start() {
      running = true;
      startBtn.textContent = "Pause";
      var now = performance.now();
      sessionStamp = now;
      phaseStart = now - pausedElapsedInPhase;
      pausedElapsedInPhase = 0;
      raf = requestAnimationFrame(rafLoop);
      fallback = setInterval(function () { step(performance.now()); }, 500);
    }

    function pause() {
      running = false;
      startBtn.textContent = "Resume";
      var now = performance.now();
      sessionElapsed += now - sessionStamp;
      pausedElapsedInPhase = now - phaseStart;
      if (raf) cancelAnimationFrame(raf);
      if (fallback) { clearInterval(fallback); fallback = null; }
    }

    function stop(silent) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (fallback) { clearInterval(fallback); fallback = null; }
      startBtn.textContent = "Start";
      phaseIdx = 0;
      pausedElapsedInPhase = 0;
      sessionElapsed = 0;
      breaths = 0;
      clockEl.textContent = "0:00";
      breathsEl.textContent = "0 breaths";
      phaseName.textContent = silent ? "Ready" : "Done";
      phaseCount.textContent = "";
      setCircle(0);
    }

    function finish() {
      stop(false);
      phaseName.textContent = "Done ✓";
    }

    startBtn.addEventListener("click", function () {
      if (running) { pause(); } else { start(); }
    });
    resetBtn.addEventListener("click", function () { stop(true); });

    setCircle(0);
  });
})();
