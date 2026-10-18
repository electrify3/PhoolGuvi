(function () {
    "use strict";

    let isRunning = false;
    let instantVideoBypass = true;
    let targetSpeed = 16.0;
    let isBusy = false;
    let lastProcessedLessonId = null;

    let hudTemplate = null;
    let lastTemplateRequestTime = 0;
    let requestCount = 0;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function getFallbackHudHtml() {
        return `
<div id="guvi-v3-hud">
    <div class="guvi-v3-header">
        <strong>🚀 GUVI Direct Engine v3.0</strong>
        <button id="guvi-v3-toggle">OFF</button>
    </div>
    <div class="guvi-v3-controls">
        <label>
            <input type="checkbox" id="guvi-v3-instant" checked /> Instant Video API Bypass
        </label>
        <select id="guvi-v3-speed">
            <option value="4">4x</option>
            <option value="8">8x</option>
            <option value="16" selected>16x</option>
        </select>
    </div>
    <div id="guvi-v3-lesson">Lesson: Detecting...</div>
    <div id="guvi-v3-status">Status: Ready</div>
    <div id="guvi-v3-log">Waiting for GUVI CourseContent...</div>
</div>`;
    }

    function requestHudTemplate() {
        const now = Date.now();
        if (now - lastTemplateRequestTime < 1000) return;
        lastTemplateRequestTime = now;
        requestCount++;

        window.postMessage({ source: "guvi-v3-hud", type: "request-template" }, "*");

        // Fallback after 3 seconds if template loader has not delivered the file
        if (requestCount >= 3 && !hudTemplate) {
            hudTemplate = getFallbackHudHtml();
            createHUD();
        }
    }

    // --- 1. Build Floating Control Panel (HUD) ---
    function createHUD() {
        if (document.getElementById("guvi-v3-hud")) return;
        if (!hudTemplate) {
            requestHudTemplate();
            return;
        }

        const template = document.createElement("template");
        template.innerHTML = hudTemplate.trim();
        const hud = template.content.querySelector("#guvi-v3-hud") || template.content.firstElementChild;
        if (!hud) {
            console.error("[GUVI Engine v3] The HUD template is invalid.");
            return;
        }

        const container = document.body || document.documentElement;
        if (!container) return;
        container.appendChild(template.content);

        const toggleBtn = document.getElementById("guvi-v3-toggle");
        const instantChk = document.getElementById("guvi-v3-instant");
        const speedSel = document.getElementById("guvi-v3-speed");

        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => {
                isRunning = !isRunning;
                toggleBtn.textContent = isRunning ? "ON" : "OFF";
                toggleBtn.style.background = isRunning ? "#10b981" : "#ef4444";
                setStatus(isRunning ? "Resumed" : "Paused");
            });
        }

        if (instantChk) {
            instantChk.addEventListener("change", (e) => {
                instantVideoBypass = e.target.checked;
            });
        }

        if (speedSel) {
            speedSel.addEventListener("change", (e) => {
                targetSpeed = parseFloat(e.target.value);
            });
        }
    }

    window.addEventListener("message", (event) => {
        if (event.source !== window || event.data?.source !== "guvi-v3-hud") return;

        if (event.data.type === "template" && event.data.html) {
            hudTemplate = event.data.html;
            createHUD();
        } else if (event.data.type === "error") {
            console.warn("[GUVI Engine v3] Template loader error, using fallback HUD:", event.data.message);
            if (!hudTemplate) {
                hudTemplate = getFallbackHudHtml();
                createHUD();
            }
        }
    });

    function setLessonText(txt) {
        const el = document.getElementById("guvi-v3-lesson");
        if (el) el.textContent = `Lesson: ${txt}`;
    }

    function setStatus(txt) {
        const el = document.getElementById("guvi-v3-status");
        if (el) el.textContent = `Status: ${txt}`;
    }

    function setLog(txt) {
        const el = document.getElementById("guvi-v3-log");
        if (el) el.textContent = txt;
        console.log("[GUVI Engine v3]", txt);
    }

    // --- 2. Promise Wrapper Around GUVI's Internal authorize.invisibleAjax / authorize.ajax ---
    function guviAjax(payload, endpoint = "courseContent", invisible = true) {
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    resolve(null);
                }
            }, 10000);

            try {
                const fn = invisible && window.authorize?.invisibleAjax
                    ? window.authorize.invisibleAjax.bind(window.authorize)
                    : window.authorize?.ajax?.bind(window.authorize);

                if (!fn) {
                    clearTimeout(timer);
                    resolve(null);
                    return;
                }

                fn(payload, endpoint, (rawResponse) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);

                    if (!rawResponse || rawResponse === "ajax_timeout" || rawResponse === "access_denied") {
                        resolve(null);
                        return;
                    }
                    try {
                        const parsed = typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
                        resolve(parsed);
                    } catch (e) {
                        resolve(rawResponse);
                    }
                });
            } catch (err) {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    console.error("[GUVI Engine v3] Ajax error:", err);
                    resolve(null);
                }
            }
        });
    }

    // --- 3. Helper: Get Current Course & Active Sublesson ---
    function getCourseId() {
        const params = new URLSearchParams(window.location.search);
        let course = params.get("course");
        if (!course) {
            const match = window.location.pathname.match(/\/courses-video\/([^\/?#]+)/);
            if (match) course = match[1];
        }
        return course;
    }

    function getSublessonInfo() {
        const $ = window.jQuery || window.$;
        if (!$) return null;

        const videoTab = $("#video-activity-tab");
        const sublessonId =
            videoTab.data("sublessonId") ||
            videoTab.attr("data-sublesson-id") ||
            videoTab.attr("data-sublessonid");

        const lessonContentData = $(".lesson-content").data() || {};
        const currentLessonData = lessonContentData.currentLessonData || lessonContentData;

        // Fallback to active stepper item if sublessonId is not on the tab yet
        const activeLi = $(".list-unstyled.stepper li.active, .sublesson.active").first();
        const effectiveSublessonId = sublessonId || activeLi.attr("id");

        const liData = effectiveSublessonId ? $("#" + effectiveSublessonId).data(effectiveSublessonId) : null;
        const firstItem = Array.isArray(liData) && liData[0] ? liData[0] : currentLessonData;

        return {
            sublessonId: effectiveSublessonId || firstItem?.lessonId || null,
            level: firstItem?.level || lessonContentData?.level || "l1",
            type: firstItem?.type || lessonContentData?.type || "lesson",
            topic: firstItem?.topic || lessonContentData?.topic || effectiveSublessonId || "Unknown",
            disableActivity: Boolean(firstItem?.disableActivity || lessonContentData?.disableActivity)
        };
    }

    // --- 4. Close Any Blocking Modals (Points Modal, Activity Questions Modal, Lock Modal) ---
    function cleanupModals() {
        const $ = window.jQuery || window.$;
        if (!$) return;

        // If the +Geekoins points modal is open, dismiss it
        const pointsModal = $("#preassessmentCompletionModal");
        if (pointsModal.hasClass("show") || pointsModal.css("display") === "block") {
            try { pointsModal.modal("hide"); } catch (e) { pointsModal.hide().removeClass("show"); }
        }

        const questionsModal = $("#videoActivityQuestionsModal");
        if (questionsModal.hasClass("show") || questionsModal.css("display") === "block") {
            try { questionsModal.modal("hide"); } catch (e) { questionsModal.hide().removeClass("show"); }
        }

        const lockModal = $("#activityLockInfo");
        if (lockModal.hasClass("show") || lockModal.css("display") === "block") {
            try { lockModal.modal("hide"); } catch (e) { lockModal.hide().removeClass("show"); }
        }

        $(".modal-backdrop").remove();
        $("body").removeClass("modal-open").css("padding-right", "");
    }

    // --- 5. Step 1: Complete Video (Instant API Bypass OR 16x Speed) ---
    async function completeVideoStep(courseId, info) {
        const $ = window.jQuery || window.$;
        const quizLockHidden = $(".quiz-lock").hasClass("hide");

        if (instantVideoBypass) {
            setStatus("Sending video-activity completion API...");
            await guviAjax(
                {
                    type: "video-activity",
                    courseId: courseId,
                    sublessonId: info.sublessonId,
                    level: info.level
                },
                "courseContent",
                true
            );

            // Unlock the Activity tab using GUVI's own CourseContent method
            if (window.CourseContent) {
                try {
                    const cc = new window.CourseContent();
                    cc.unlockActivityLock();
                } catch (e) { }
            }
            $("#video-activity-tab").removeClass("disabled").removeAttr("disabled");
            $(".quiz-lock").addClass("hide");

            // Pause the video so it doesn't waste bandwidth
            if (window.player && typeof window.player.pause === "function") {
                try { window.player.pause(); } catch (e) { }
            }
            const vid = document.querySelector("#course-video, video");
            if (vid && !vid.paused) {
                try { vid.pause(); } catch (e) { }
            }

            setLog(`Video marked watched via API (${info.sublessonId})`);
            return true;
        }

        // Fallback: 16x Playback Mode if user unchecked "Instant Video API Bypass"
        if (quizLockHidden) {
            return true; // Already unlocked!
        }

        const video = document.querySelector("#course-video, video");
        if (video) {
            video.muted = true;
            if (video.paused) {
                video.play().catch(() => { });
            }
            try {
                video.playbackRate = targetSpeed;
            } catch (e) {
                video.playbackRate = 4.0;
            }
            const pct = video.duration ? Math.round((video.currentTime / video.duration) * 100) : 0;
            setStatus(`Watching video at ${video.playbackRate}x (${pct}%)...`);
        }
        return false;
    }

    // --- 6. Step 2: Fetch & Auto-Solve the Activity Quiz via Direct API ---
    async function solveQuizDirectAPI(courseId, info) {
        const $ = window.jQuery || window.$;

        if (info.disableActivity) {
            setLog("Activity disabled for this lesson. Advancing...");
            return { validated: true, nextCourseData: null };
        }

        setStatus("Fetching quiz questions...");
        let quizQuestions = $("#" + info.sublessonId).data(info.sublessonId + "_quiz");

        if (!quizQuestions) {
            const quizRes = await guviAjax(
                {
                    type: "get-quiz",
                    courseId: courseId,
                    sublessonId: info.sublessonId
                },
                "courseContent",
                true
            );

            if (quizRes && quizRes[info.sublessonId]) {
                try {
                    quizQuestions = typeof quizRes[info.sublessonId] === "string"
                        ? JSON.parse(quizRes[info.sublessonId])
                        : quizRes[info.sublessonId];
                    $("#" + info.sublessonId).data(info.sublessonId + "_quiz", quizQuestions);
                } catch (e) { }
            }
        }

        // If this video has no quiz questions at all, advance immediately
        if (!Array.isArray(quizQuestions) || quizQuestions.length === 0) {
            setLog("No quiz questions for this video.");
            return { validated: true, nextCourseData: null };
        }

        // Render quiz in DOM so GUVI's state stays in sync
        if (window.CourseContent) {
            try {
                const cc = new window.CourseContent();
                cc.renderQuiz(quizQuestions);
            } catch (e) { }
        }

        const numQuestions = quizQuestions.length;
        // Start by guessing option "1" for every question: { "1": "1", "2": "1", ... }
        const currentGuess = {};
        for (let i = 1; i <= numQuestions; i++) {
            currentGuess[String(i)] = "1";
        }

        // At most 6 attempts to solve multi-question quiz
        for (let attempt = 1; attempt <= 6; attempt++) {
            setStatus(`Solving ${numQuestions} quiz question(s) (Attempt ${attempt})...`);
            setLog(`Submitting quizData: ${JSON.stringify(currentGuess)}`);

            // Sync our guess into $(".quizstorage").data() and radio buttons
            const quizStorage = $(".quizstorage");
            for (let i = 1; i <= numQuestions; i++) {
                const qKey = String(i);
                const optVal = currentGuess[qKey];
                quizStorage.data(qKey, optVal);

                const radio = $(`#q${i}VideoActivity input[name="ques${i}"][value="${optVal}"]`);
                if (radio.length) {
                    $(`#q${i}VideoActivity button.options`).removeClass("active");
                    radio.prop("checked", true);
                    radio.closest("button.options").addClass("active");
                }
            }

            const validateRes = await guviAjax(
                {
                    type: "validate-quiz",
                    courseId: courseId,
                    sublessonId: info.sublessonId,
                    quizData: currentGuess
                },
                "courseContent",
                true
            );

            if (!validateRes) {
                await sleep(500);
                continue;
            }

            // Case A: 100% Correct!
            if (
                (Array.isArray(validateRes) && validateRes[0] && (validateRes[0].validated === true || validateRes[0].validated === "true" || validateRes[0].validated == 1)) ||
                (validateRes && !Array.isArray(validateRes) && (validateRes.validated === true || validateRes.validated === "true" || validateRes.validated == 1))
            ) {
                setLog(`Quiz 100% Solved on Attempt ${attempt}!`);
                return { validated: true, nextCourseData: Array.isArray(validateRes) ? validateRes : null };
            }

            // Case B: Already validated previously!
            if (validateRes.validated === "already" || (Array.isArray(validateRes) && validateRes[0]?.validated === "already")) {
                setLog(`Quiz was already completed!`);
                return { validated: true, nextCourseData: null };
            }

            // Case C: Partial/Wrong answer -> validateRes.result (array or object)
            if (Array.isArray(validateRes.result)) {
                const resArr = validateRes.result;
                const allOnes = resArr.every((r) => String(r) === "1");
                if (allOnes) {
                    setLog(`All answers verified correct!`);
                    return { validated: true, nextCourseData: null };
                }

                for (let idx = 0; idx < numQuestions; idx++) {
                    const qKey = String(idx + 1);
                    const maxOpts = quizQuestions[idx]?.options?.length || 4;
                    if (String(resArr[idx]) !== "1") {
                        const nextOpt = (parseInt(currentGuess[qKey], 10) % maxOpts) + 1;
                        currentGuess[qKey] = String(nextOpt);
                    }
                }
            } else if (validateRes.result && typeof validateRes.result === "object") {
                const resObj = validateRes.result;
                for (let idx = 0; idx < numQuestions; idx++) {
                    const qKey = String(idx + 1);
                    const maxOpts = quizQuestions[idx]?.options?.length || 4;
                    const val = resObj[qKey] ?? resObj[idx];
                    if (String(val) !== "1") {
                        const nextOpt = (parseInt(currentGuess[qKey], 10) % maxOpts) + 1;
                        currentGuess[qKey] = String(nextOpt);
                    }
                }
            } else {
                // Fallback increment
                for (let idx = 0; idx < numQuestions; idx++) {
                    const qKey = String(idx + 1);
                    const maxOpts = quizQuestions[idx]?.options?.length || 4;
                    const nextOpt = (parseInt(currentGuess[qKey], 10) % maxOpts) + 1;
                    currentGuess[qKey] = String(nextOpt);
                }
            }

            await sleep(350);
        }

        return { validated: false, nextCourseData: null };
    }

    // --- 7. Step 3: Advance to Next Video Lesson ---
    async function moveToNextVideo(courseId, currentSublessonId, nextCourseData) {
        const $ = window.jQuery || window.$;
        cleanupModals();

        // 1. If validate-quiz returned next lesson data, use CourseContent.renderCourse directly
        if (Array.isArray(nextCourseData) && nextCourseData[0] && window.CourseContent) {
            const nextId = nextCourseData[0].lessonId;
            if (nextId && nextId !== currentSublessonId) {
                setStatus(`Loading next lesson: ${nextCourseData[0].topic || nextId}...`);
                const cc = new window.CourseContent();
                if (nextCourseData[0].type === "lesson") {
                    cc.renderCourse(nextCourseData);
                    cc.renderBreadCrumb(nextCourseData);
                } else {
                    cc.renderingDeciderWithCourseList(nextCourseData);
                }
                cleanupModals();
                await sleep(1200);
                return;
            }
        }

        // 2. Otherwise, use sidebar progression
        const currentLi = $(`#${currentSublessonId}`);
        currentLi.addClass("completed");

        let nextLi = currentLi.next("li");
        if (!nextLi.length) {
            const currentCard = currentLi.closest("div.card");
            const nextCards = currentCard.nextAll("div.card");
            for (let i = 0; i < nextCards.length; i++) {
                const card = $(nextCards[i]);
                const collapseBtn = card.find(".card-header .btn.btn-link.collapsed, button[data-toggle='collapse']").eq(0);
                if (collapseBtn.length) collapseBtn.trigger("click");
                const candidate = card.find(".list-unstyled.stepper li").eq(0);
                if (candidate.length) {
                    nextLi = candidate;
                    await sleep(300);
                    break;
                }
            }
        }

        if (nextLi && nextLi.length) {
            nextLi.removeClass("stepperLock progressLock customTooltip lock").addClass("sublesson font-weight-bold");
            nextLi.children("a").addClass("black").attr("href", "#");

            const nextTopic = nextLi.text().trim() || nextLi.attr("id");
            setStatus(`Advancing to: ${nextTopic}...`);
            setLog(`Clicking next lesson: ${nextLi.attr("id")}`);

            nextLi.trigger("click");
            const anchor = nextLi.find("a")[0] || nextLi[0];
            if (anchor && typeof anchor.click === "function") {
                anchor.click();
            }
            await sleep(1500);
        } else {
            setStatus("🎉 All video lessons in this course are completed!");
            isRunning = false;
            const toggleBtn = document.getElementById("guvi-v3-toggle");
            if (toggleBtn) {
                toggleBtn.textContent = "DONE";
                toggleBtn.style.background = "#3b82f6";
            }
        }
    }

    // --- 8. Main Automation Loop ---
    setInterval(async () => {
        createHUD();
        if (!isRunning || isBusy) return;

        const $ = window.jQuery || window.$;
        if (!$ || !window.authorize) return;

        isBusy = true;
        try {
            cleanupModals();

            const courseId = getCourseId();
            const info = getSublessonInfo();

            if (!courseId || !info || !info.sublessonId) {
                setStatus("Waiting for lesson data to load...");
                return;
            }

            setLessonText(`${info.topic} (${info.sublessonId})`);

            // If current lesson was already processed and we're waiting for the page transition, advance again
            if (lastProcessedLessonId === info.sublessonId) {
                setStatus(`Lesson ${info.topic} already solved. Waiting for next lesson to load...`);
                await moveToNextVideo(courseId, info.sublessonId, null);
                return;
            }

            // If current item is a coding assignment (like Beginner Module - Assignments), advance to next lesson
            if (info.type !== "lesson" && info.type !== "quiz") {
                setStatus(`Reached ${info.type} (${info.topic}). Checking next lesson...`);
                await moveToNextVideo(courseId, info.sublessonId, null);
                return;
            }

            // 1. Complete or watch the video
            const videoReady = await completeVideoStep(courseId, info);
            if (!videoReady) {
                return; // Still playing at 16x
            }

            // 2. Solve the quiz via GUVI's direct API
            const { validated, nextCourseData } = await solveQuizDirectAPI(courseId, info);

            // 3. Move to the next lesson once validated
            if (validated) {
                lastProcessedLessonId = info.sublessonId;
                await moveToNextVideo(courseId, info.sublessonId, nextCourseData);
            }
        } catch (err) {
            console.error("[GUVI Engine v3 Loop Error]:", err);
        } finally {
            isBusy = false;
        }
    }, 1800);
})();
