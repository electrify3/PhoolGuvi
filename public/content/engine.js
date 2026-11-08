/**
 * PhoolGuvi — Auto-Solver Engine (MAIN world)
 *
 * Runs in the page's MAIN world on courses-video pages to access
 * GUVI's internal APIs (window.authorize, window.CourseContent, jQuery).
 *
 * ALL UI has been removed — state updates and logs are sent to the
 * React side panel via postMessage → bridge → chrome.runtime.
 */
(function PhoolGuviEngine() {
  "use strict";

  const MSG_SOURCE = "phoolguvi-bridge";
  const TAG = "[PhoolGuvi Engine]";

  // ── Constants ────────────────────────────────────────────
  const LOOP_INTERVAL_MS    = 1800;
  const AJAX_TIMEOUT_MS     = 10000;
  const MAX_QUIZ_ATTEMPTS   = 6;
  const QUIZ_RETRY_DELAY_MS = 350;
  const AJAX_RETRY_DELAY_MS = 500;
  const ADVANCE_DELAY_MS    = 1500;
  const RENDER_SETTLE_MS    = 1200;
  const SECTION_EXPAND_MS   = 300;
  const DEFAULT_SPEED       = 16.0;
  const FALLBACK_SPEED      = 4.0;

  const MODAL_IDS = [
    "#preassessmentCompletionModal",
    "#videoActivityQuestionsModal",
    "#activityLockInfo",
  ];

  // ── State ────────────────────────────────────────────────
  let isRunning           = false;
  let instantVideoBypass  = true;
  let targetSpeed         = DEFAULT_SPEED;
  let isBusy              = false;
  let lastProcessedLesson = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jq = () => window.jQuery || window.$ || null;

  // ── Messaging (replaces old HUD DOM manipulation) ────────
  function sendToPanel(msg) {
    window.postMessage({ source: MSG_SOURCE, direction: "to-extension", ...msg }, "*");
  }

  function updateState(patch) {
    sendToPanel({ type: "STATE_UPDATE", payload: patch });
  }

  function appendLog(text) {
    sendToPanel({ type: "LOG_APPEND", text });
    console.log(TAG, text);
  }

  // ── Listen for Commands from Side Panel ──────────────────
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== MSG_SOURCE) return;
    if (event.data.direction !== "to-page") return;

    const { type, command, value } = event.data;

    if (type === "COMMAND") {
      switch (command) {
        case "SET_RUNNING":
          isRunning = Boolean(value);
          updateState({ isRunning });
          appendLog(isRunning ? "Engine started" : "Engine paused");
          break;
        case "SET_INSTANT_BYPASS":
          instantVideoBypass = Boolean(value);
          updateState({ instantBypass: instantVideoBypass });
          break;
        case "SET_SPEED":
          targetSpeed = Number(value) || DEFAULT_SPEED;
          updateState({ speed: targetSpeed });
          break;
      }
    }

    if (type === "GET_STATE") {
      updateState({
        isRunning,
        instantBypass: instantVideoBypass,
        speed: targetSpeed,
        status: "Ready",
        lesson: "",
        pageType: "courses-video",
      });
    }
  });

  // Send initial state so side panel knows we're loaded
  updateState({
    isRunning: false,
    instantBypass: true,
    speed: DEFAULT_SPEED,
    status: "Ready",
    lesson: "",
    pageType: "courses-video",
  });

  // ── GUVI Ajax Wrapper ────────────────────────────────────
  function guviAjax(payload, endpoint = "courseContent", invisible = true) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; resolve(null); }
      }, AJAX_TIMEOUT_MS);

      const settle = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(val);
      };

      try {
        const auth = window.authorize;
        const fn = invisible && auth?.invisibleAjax
          ? auth.invisibleAjax.bind(auth)
          : auth?.ajax?.bind(auth);

        if (!fn) { settle(null); return; }

        fn(payload, endpoint, (raw) => {
          if (!raw || raw === "ajax_timeout" || raw === "access_denied") {
            settle(null); return;
          }
          try { settle(typeof raw === "string" ? JSON.parse(raw) : raw); }
          catch { settle(raw); }
        });
      } catch (err) {
        console.error(TAG, "Ajax error:", err);
        settle(null);
      }
    });
  }

  // ── Course / Sublesson Detection ─────────────────────────
  function getCourseId() {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("course");
    if (fromQuery) return fromQuery;

    const match = window.location.pathname.match(/\/courses-video\/([^\/?#]+)/);
    return match ? match[1] : null;
  }

  function getSublessonInfo() {
    const $ = jq();
    if (!$) return null;

    const videoTab  = $("#video-activity-tab");
    const subFromTab = videoTab.data("sublessonId")
                    || videoTab.attr("data-sublesson-id")
                    || videoTab.attr("data-sublessonid");

    const lessonData  = $(".lesson-content").data() || {};
    const currentData = lessonData.currentLessonData || lessonData;

    const activeLi    = $(".list-unstyled.stepper li.active, .sublesson.active").first();
    const sublessonId = subFromTab || activeLi.attr("id");

    const liData    = sublessonId ? $(`#${sublessonId}`).data(sublessonId) : null;
    const firstItem = Array.isArray(liData) && liData[0] ? liData[0] : currentData;

    return {
      sublessonId:     sublessonId || firstItem?.lessonId || null,
      level:           firstItem?.level   || lessonData?.level || "l1",
      type:            firstItem?.type    || lessonData?.type  || "lesson",
      topic:           firstItem?.topic   || lessonData?.topic || sublessonId || "Unknown",
      disableActivity: Boolean(firstItem?.disableActivity || lessonData?.disableActivity),
    };
  }

  // ── Modal Cleanup ────────────────────────────────────────
  function dismissModals() {
    const $ = jq();
    if (!$) return;

    for (const selector of MODAL_IDS) {
      const modal = $(selector);
      if (modal.hasClass("show") || modal.css("display") === "block") {
        try { modal.modal("hide"); }
        catch { modal.hide().removeClass("show"); }
      }
    }
    $(".modal-backdrop").remove();
    $("body").removeClass("modal-open").css("padding-right", "");
  }

  // ── Step 1: Complete Video ───────────────────────────────
  async function completeVideo(courseId, info) {
    const $ = jq();

    if (instantVideoBypass) {
      updateState({ status: "Sending video-activity completion…" });

      await guviAjax({
        type: "video-activity",
        courseId,
        sublessonId: info.sublessonId,
        level: info.level,
      });

      if (window.CourseContent) {
        try { new window.CourseContent().unlockActivityLock(); } catch {}
      }
      $("#video-activity-tab").removeClass("disabled").removeAttr("disabled");
      $(".quiz-lock").addClass("hide");

      // Pause video to save bandwidth
      if (window.player?.pause) { try { window.player.pause(); } catch {} }
      const vid = document.querySelector("#course-video, video");
      if (vid && !vid.paused) { try { vid.pause(); } catch {} }

      appendLog(`Video marked watched via API (${info.sublessonId})`);
      return true;
    }

    // Fallback: accelerated playback
    if ($(".quiz-lock").hasClass("hide")) return true;

    const video = document.querySelector("#course-video, video");
    if (video) {
      video.muted = true;
      if (video.paused) video.play().catch(() => {});
      try { video.playbackRate = targetSpeed; }
      catch { video.playbackRate = FALLBACK_SPEED; }

      const pct = video.duration
        ? Math.round((video.currentTime / video.duration) * 100) : 0;
      updateState({ status: `Watching at ${video.playbackRate}× (${pct}%)…` });
    }
    return false;
  }

  // ── Step 2: Solve Quiz ───────────────────────────────────
  async function solveQuiz(courseId, info) {
    const $ = jq();

    if (info.disableActivity) {
      appendLog("Activity disabled — advancing…");
      return { validated: true, nextCourseData: null };
    }

    updateState({ status: "Fetching quiz questions…" });
    let questions = $(`#${info.sublessonId}`).data(`${info.sublessonId}_quiz`);

    if (!questions) {
      const res = await guviAjax({
        type: "get-quiz", courseId, sublessonId: info.sublessonId,
      });
      if (res?.[info.sublessonId]) {
        try {
          const raw = res[info.sublessonId];
          questions = typeof raw === "string" ? JSON.parse(raw) : raw;
          $(`#${info.sublessonId}`).data(`${info.sublessonId}_quiz`, questions);
        } catch {}
      }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      appendLog("No quiz questions for this video.");
      return { validated: true, nextCourseData: null };
    }

    if (window.CourseContent) {
      try { new window.CourseContent().renderQuiz(questions); } catch {}
    }

    const count = questions.length;
    const guess = {};
    for (let i = 1; i <= count; i++) guess[String(i)] = "1";

    for (let attempt = 1; attempt <= MAX_QUIZ_ATTEMPTS; attempt++) {
      updateState({ status: `Solving ${count} question(s) — attempt ${attempt}…` });
      appendLog(`Submitting: ${JSON.stringify(guess)}`);

      // Sync guess into DOM
      const storage = $(".quizstorage");
      for (let i = 1; i <= count; i++) {
        const key = String(i);
        const val = guess[key];
        storage.data(key, val);
        const radio = $(`#q${i}VideoActivity input[name="ques${i}"][value="${val}"]`);
        if (radio.length) {
          $(`#q${i}VideoActivity button.options`).removeClass("active");
          radio.prop("checked", true);
          radio.closest("button.options").addClass("active");
        }
      }

      const result = await guviAjax({
        type: "validate-quiz", courseId, sublessonId: info.sublessonId, quizData: guess,
      });

      if (!result) { await sleep(AJAX_RETRY_DELAY_MS); continue; }

      // Fully validated
      const entry = Array.isArray(result) ? result[0] : result;
      if (entry && (entry.validated === true || entry.validated === "true" || entry.validated == 1)) {
        appendLog(`Quiz solved on attempt ${attempt}!`);
        return { validated: true, nextCourseData: Array.isArray(result) ? result : null };
      }

      // Already complete
      if (entry?.validated === "already") {
        appendLog("Quiz was already completed.");
        return { validated: true, nextCourseData: null };
      }

      // Partial — rotate wrong answers
      const resData = result.result;
      if (Array.isArray(resData)) {
        if (resData.every((r) => String(r) === "1")) {
          appendLog("All answers correct!");
          return { validated: true, nextCourseData: null };
        }
        for (let i = 0; i < count; i++) {
          if (String(resData[i]) !== "1") {
            const key = String(i + 1);
            const max = questions[i]?.options?.length || 4;
            guess[key] = String((parseInt(guess[key], 10) % max) + 1);
          }
        }
      } else if (resData && typeof resData === "object") {
        for (let i = 0; i < count; i++) {
          const key = String(i + 1);
          const val = resData[key] ?? resData[i];
          if (String(val) !== "1") {
            const max = questions[i]?.options?.length || 4;
            guess[key] = String((parseInt(guess[key], 10) % max) + 1);
          }
        }
      } else {
        for (let i = 0; i < count; i++) {
          const key = String(i + 1);
          const max = questions[i]?.options?.length || 4;
          guess[key] = String((parseInt(guess[key], 10) % max) + 1);
        }
      }

      await sleep(QUIZ_RETRY_DELAY_MS);
    }

    return { validated: false, nextCourseData: null };
  }

  // ── Step 3: Advance to Next Lesson ───────────────────────
  async function advanceToNext(courseId, currentId, nextData) {
    const $ = jq();
    dismissModals();

    // Path A: server returned next lesson payload
    if (Array.isArray(nextData) && nextData[0] && window.CourseContent) {
      const nextId = nextData[0].lessonId;
      if (nextId && nextId !== currentId) {
        updateState({ status: `Loading: ${nextData[0].topic || nextId}…` });
        const cc = new window.CourseContent();
        if (nextData[0].type === "lesson") {
          cc.renderCourse(nextData);
          cc.renderBreadCrumb(nextData);
        } else {
          cc.renderingDeciderWithCourseList(nextData);
        }
        dismissModals();
        await sleep(RENDER_SETTLE_MS);
        return;
      }
    }

    // Path B: sidebar click progression
    const currentLi = $(`#${currentId}`);
    currentLi.addClass("completed");

    let nextLi = currentLi.next("li");
    if (!nextLi.length) {
      const cards = currentLi.closest("div.card").nextAll("div.card");
      for (let i = 0; i < cards.length; i++) {
        const card = $(cards[i]);
        const btn = card.find(".card-header .btn.btn-link.collapsed, button[data-toggle='collapse']").eq(0);
        if (btn.length) btn.trigger("click");
        const candidate = card.find(".list-unstyled.stepper li").eq(0);
        if (candidate.length) {
          nextLi = candidate;
          await sleep(SECTION_EXPAND_MS);
          break;
        }
      }
    }

    if (nextLi?.length) {
      nextLi.removeClass("stepperLock progressLock customTooltip lock")
            .addClass("sublesson font-weight-bold");
      nextLi.children("a").addClass("black").attr("href", "#");

      const nextTopic = nextLi.text().trim() || nextLi.attr("id");
      updateState({ status: `Advancing to: ${nextTopic}…` });
      appendLog(`Clicking: ${nextLi.attr("id")}`);

      nextLi.trigger("click");
      const anchor = nextLi.find("a")[0] || nextLi[0];
      if (anchor?.click) anchor.click();
      await sleep(ADVANCE_DELAY_MS);
    } else {
      updateState({ status: "🎉 All lessons complete!", courseComplete: true, isRunning: false });
      isRunning = false;
    }
  }

  // ── Main Automation Loop ─────────────────────────────────
  setInterval(async () => {
    if (!isRunning || isBusy) return;

    const $ = jq();
    if (!$ || !window.authorize) return;

    isBusy = true;
    try {
      dismissModals();

      const courseId = getCourseId();
      const info    = getSublessonInfo();

      if (!courseId || !info?.sublessonId) {
        updateState({ status: "Waiting for lesson data…" });
        return;
      }

      updateState({ lesson: `${info.topic} (${info.sublessonId})` });

      if (lastProcessedLesson === info.sublessonId) {
        updateState({ status: `${info.topic} already solved — waiting…` });
        await advanceToNext(courseId, info.sublessonId, null);
        return;
      }

      if (info.type !== "lesson" && info.type !== "quiz") {
        updateState({ status: `Reached ${info.type} (${info.topic}) — next…` });
        await advanceToNext(courseId, info.sublessonId, null);
        return;
      }

      const videoReady = await completeVideo(courseId, info);
      if (!videoReady) return;

      const { validated, nextCourseData } = await solveQuiz(courseId, info);
      if (validated) {
        lastProcessedLesson = info.sublessonId;
        await advanceToNext(courseId, info.sublessonId, nextCourseData);
      }
    } catch (err) {
      console.error(TAG, "Loop error:", err);
    } finally {
      isBusy = false;
    }
  }, LOOP_INTERVAL_MS);

  console.log(TAG, "Engine loaded on courses-video page.");
})();

