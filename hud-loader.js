(function () {
    "use strict";

    const messageSource = "guvi-v3-hud";
    let templatePromise = null;

    function injectStyle() {
        try {
            if (document.getElementById("guvi-v3-style")) return;
            const link = document.createElement("link");
            link.id = "guvi-v3-style";
            link.rel = "stylesheet";
            link.href = chrome.runtime.getURL("style.css");
            (document.head || document.documentElement).appendChild(link);
        } catch (err) {
            console.warn("[GUVI Engine v3] Could not inject style link:", err);
        }
    }

    function loadTemplate() {
        if (!templatePromise) {
            templatePromise = fetch(chrome.runtime.getURL("hud.html"))
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`HUD template request failed (${response.status})`);
                    }
                    return response.text();
                })
                .catch((error) => {
                    templatePromise = null;
                    throw error;
                });
        }
        return templatePromise;
    }

    async function sendTemplate() {
        try {
            injectStyle();
            const html = await loadTemplate();
            window.postMessage({ source: messageSource, type: "template", html }, "*");
        } catch (error) {
            console.error("[GUVI Engine v3] Unable to fetch hud.html:", error);
            window.postMessage({
                source: messageSource,
                type: "error",
                message: error.message
            }, "*");
        }
    }

    // Immediately inject stylesheet and load template on initial execution
    injectStyle();
    sendTemplate();

    // Respond to on-demand template requests from engine.js
    window.addEventListener("message", (event) => {
        if (
            event.source !== window ||
            event.data?.source !== messageSource ||
            event.data.type !== "request-template"
        ) {
            return;
        }

        sendTemplate();
    });
})();
