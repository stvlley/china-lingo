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

  function updateBar(worker) {
    if (document.getElementById("upd")) return;
    const el = document.createElement("div");
    el.id = "upd";
    el.innerHTML = `<span>✨ A new version is ready</span><button>Update</button>`;
    el.querySelector("button").onclick = () => { worker.postMessage("skipWaiting"); el.remove(); };
    document.body.appendChild(el);
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then(reg => {
        if (reg.waiting && navigator.serviceWorker.controller) updateBar(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const w = reg.installing;
          w && w.addEventListener("statechange", () => {
            if (w.state === "installed" && navigator.serviceWorker.controller) updateBar(w);
          });
        });
        document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
      }).catch(() => {});
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return; reloading = true; location.reload();
    });
  }
  rerender();
})();
