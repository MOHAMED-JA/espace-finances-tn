  /* Thème appliqué avant l'affichage pour éviter tout flash */
  (function () {
    var t = null;
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (t !== 'dark' && t !== 'light') {
      t = window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', t);
  })();
  /* Invitation à installer l'application (PWA), gardée pour le bouton « Installer l'application » */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    window.__invitationInstallation = e;
    document.dispatchEvent(new Event('installation-possible'));
  });
