/* China Lingo: install prompt, service worker registration, update banner. */
(function () {
  "use strict";
  let deferred = null;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const rerender = () => { if (typeof SES !== "undefined" && !SES && typeof render === "function") render(); };

  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; rerender(); });
  window.addEventListener("appinstalled", () => { deferred = null; if (typeof toast === "function") toast("🎉 China Lingo installed!"); rerender(); });

  window.PWA = {
    isIOS, standalone,
    canPrompt: () => !!deferred,
    prompt: async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (e) {} deferred = null; }
  };
  document.documentElement.classList.toggle("standalone", standalone());

  /* keep data from being evicted by the browser */
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

  /* updates apply automatically; never reload in the middle of a lesson */
  window.__applyUpdate = () => { try { sessionStorage.setItem("cl-updated", "1"); } catch (e) {} location.reload(); };
  try { if (sessionStorage.getItem("cl-updated")) { sessionStorage.removeItem("cl-updated"); setTimeout(() => typeof toast === "function" && toast("✨ Updated to the latest version"), 400); } } catch (e) {}

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then(reg => {
        if (reg.waiting) reg.waiting.postMessage("skipWaiting");
        document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch(() => {});
    });
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      if (typeof SES !== "undefined" && SES && !SES.done) { window.__pendingUpdate = true; return; }
      reloading = true; window.__applyUpdate();
    });
  }
  rerender();
})();
