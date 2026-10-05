// Two Paydays (Mac app): offline install and the Update now button. Runs after the planner script.
(function () {
  const A = window.TP_APP;
  if (!A || !('serviceWorker' in navigator)) return;
  if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) return;
  // reload only when the person pressed Update now (not when the very first install takes control of the page)
  let applying = false, reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!applying || reloading) return; reloading = true; location.reload(); });
  // a new version has been downloaded and is waiting: show the banner with its notes
  async function offer(reg) {
    if (!reg.waiting || !navigator.serviceWorker.controller) return false;
    let info = {};
    try { info = await (await fetch('./version.json', { cache: 'no-store' })).json(); } catch (e) { }
    const waiting = reg.waiting;
    S.update = {
      version: info.version || '', notes: info.notes || [],
      apply: () => { snapshotNow('before updating to ' + (info.version || 'a new version')); applying = true; waiting.postMessage('skipWaiting'); },
    };
    emit();
    return true;
  }
  navigator.serviceWorker.register('./sw.js').then(reg => {
    offer(reg);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(reg); });
    });
    A.checkForUpdate = async () => {
      await reg.update();
      for (let i = 0; i < 40 && reg.installing; i++) await new Promise(r => setTimeout(r, 250));
      return offer(reg);
    };
    // look for a new version every few hours and whenever the app comes back to the front
    setInterval(() => reg.update().catch(() => { }), 6 * 3600 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => { }); });
  }).catch(() => { });
})();
