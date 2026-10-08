  /* Thème appliqué avant l'affichage pour éviter tout flash */
  (function () {
    var t = null;
    try { t = localStorage.getItem('theme'); } catch (e) {}
    if (t !== 'dark' && t !== 'light' && t !== 'aurora') {
      t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
    if (t === 'aurora') document.documentElement.className += ' aurora';
    /* Langue appliquée avant l'affichage (arabe : de droite à gauche) */
    var l = null;
    try { l = localStorage.getItem('langue'); } catch (e) {}
    if (l === 'ar') { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; }
  })();
