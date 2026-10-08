/* Portefeuille du conseiller : simulations enregistrées localement (IndexedDB), rien n'est transmis.
   `creerEnregistrement` est pure et testée ; `ouvrir` enveloppe IndexedDB (navigateur seulement). */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Portefeuille = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASE = 'simulateur-av', TABLE = 'simulations', MAX = 200;

  function creerEnregistrement(etat, resume, meta, maintenant) {
    var d = maintenant || new Date();
    return {
      id: d.getTime().toString(36) + Math.random().toString(36).slice(2, 7),
      date: d.toISOString().slice(0, 10),
      horodatage: d.getTime(),
      client: String((meta && meta.client) || '').slice(0, 80),
      conseiller: String((meta && meta.conseiller) || '').slice(0, 80),
      ref: String((meta && meta.ref) || '').slice(0, 40),
      etat: JSON.parse(JSON.stringify(etat)),
      resume: resume
    };
  }

  function requete(r) {
    return new Promise(function (ok, ko) { r.onsuccess = function () { ok(r.result); }; r.onerror = function () { ko(r.error); }; });
  }

  /* Renvoie une promesse d'objet { lister, ajouter, supprimer, vider } ; rejette si IndexedDB est indisponible. */
  function ouvrir() {
    return new Promise(function (ok, ko) {
      if (typeof indexedDB === 'undefined') return ko(new Error('IndexedDB indisponible'));
      var ouverture;
      try { ouverture = indexedDB.open(BASE, 1); } catch (e) { return ko(e); }
      ouverture.onupgradeneeded = function () { ouverture.result.createObjectStore(TABLE, { keyPath: 'id' }); };
      ouverture.onerror = function () { ko(ouverture.error); };
      ouverture.onsuccess = function () {
        var db = ouverture.result;
        function magasin(mode) { return db.transaction(TABLE, mode).objectStore(TABLE); }
        ok({
          lister: function () {
            return requete(magasin('readonly').getAll()).then(function (l) { return l.sort(function (a, b) { return b.horodatage - a.horodatage; }); });
          },
          ajouter: function (enr) {
            return requete(magasin('readwrite').put(enr)).then(function () { return requete(magasin('readonly').getAll()); }).then(function (l) {
              var trop = l.sort(function (a, b) { return a.horodatage - b.horodatage; }).slice(0, Math.max(0, l.length - MAX));
              return Promise.all(trop.map(function (t) { return requete(magasin('readwrite').delete(t.id)); }));
            });
          },
          supprimer: function (id) { return requete(magasin('readwrite').delete(id)); },
          vider: function () { return requete(magasin('readwrite').clear()); }
        });
      };
    });
  }

  return { MAX: MAX, creerEnregistrement: creerEnregistrement, ouvrir: ouvrir };
});
