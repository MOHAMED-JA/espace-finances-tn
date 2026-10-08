/* Configuration de la publication : coordonnées de l'agence proposées à tous les visiteurs pour le bouton
   « Être rappelé par un conseiller » et le rapport PDF. Laisser vide pour ne rien afficher.
   Un conseiller peut saisir ses propres coordonnées dans le mode conseiller (mémorisées sur son appareil). */
(function (racine) {
  racine.ConfigSimulateur = {
    /* Adresse publique de l'application : c'est elle que contient le QR code d'installation.
       Laisser vide pour utiliser l'adresse de la page courante. */
    urlPublique: 'https://mohamed-ja.github.io/simulateur-assurance-vie/',
    agence: {
      nom: '',
      tel: '',      /* format international conseillé, ex. +216 71 000 000 (utilisé pour WhatsApp) */
      email: '',
      adresse: ''
    }
  };
})(typeof self !== 'undefined' ? self : this);
