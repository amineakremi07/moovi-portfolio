/**
 * French UI copy for the public site: landing page, footer, club-dashboard nav.
 * The site is French-only; keys keep copy in one place and out of the JSX.
 * `{name}` placeholders are filled by `t(key, { name })`.
 */

const fr = {
  'nav.primary': 'Navigation principale',
  'nav.home': 'Accueil',
  'nav.clubs': 'Clubs',
  'nav.how': 'Comment ça marche',
  'nav.howShort': 'Étapes',
  'nav.login': 'Connexion',
  'nav.register': "S'inscrire",
  'nav.signOut': 'Se déconnecter',
  'nav.menu': 'Menu',
  'nav.openMenu': 'Ouvrir le menu',
  'nav.account': 'Compte',
  'nav.sections': 'Sections de la page',
  'nav.myReservations': 'Mes réservations',
  'nav.mySpace': 'Mon espace',
  'nav.dashboard': 'Tableau de bord',
  'nav.admin': 'Administration',
  'nav.scrollTop': 'Retour en haut',

  'hero.title': 'Réservez un terrain en quelques secondes',
  'hero.body':
    'Padel, tennis et football partout en Tunisie. Les joueurs voient les créneaux libres en direct et réservent en quelques secondes. Les clubs gèrent terrains, réservations et encaissements au même endroit.',
  'hero.ctaPlayer': 'Réserver un terrain',
  'hero.ctaClub': 'Digitaliser mon club',
  'hero.stats': 'Clubs et terrains sur Moovi',
  'hero.statClubs.one': '{n} club vérifié',
  'hero.statClubs.other': '{n} clubs vérifiés',
  'hero.statCourts.one': '{n} terrain réservable',
  'hero.statCourts.other': '{n} terrains réservables',
  'hero.sports': 'Padel, tennis, football',


  'aud.title': 'Une plateforme, deux usages',
  'aud.players.title': 'Pour les joueurs',
  'aud.players.f1.title': 'Les créneaux libres en direct',
  'aud.players.f1.body': "La grille se met à jour dès qu'un autre joueur réserve. Ce que vous voyez est vraiment disponible.",
  'aud.players.f2.title': 'Votre pass dans la poche',
  'aud.players.f2.body': 'Chaque réservation a un code et un QR à présenter au club, et se retrouve dans votre compte.',
  'aud.players.f3.title': 'Réserver à nouveau en un clic',
  'aud.players.f3.body': 'Même terrain, même jour, même heure : Moovi propose la prochaine date libre depuis vos réservations.',
  'aud.players.f4.title': 'Annulation gratuite',
  'aud.players.f4.body': "Jusqu'à 24 heures avant le match, sans appeler le club.",
  'aud.players.cta': 'Trouver un club',
  'aud.clubs.title': 'Pour les clubs',
  'aud.clubs.f1.title': 'Un planning par terrain',
  'aud.clubs.f1.body': 'Réservations en ligne, au comptoir ou par téléphone, sur une seule grille partagée avec votre équipe.',
  'aud.clubs.f2.title': 'Moins de terrains vides',
  'aud.clubs.f2.body': 'Code et QR à l’arrivée, absences enregistrées, joueurs récidivistes suspendus automatiquement.',
  'aud.clubs.f3.title': 'Encaissements et statistiques',
  'aud.clubs.f3.body': "Chiffre d'affaires en TND, taux d'occupation, heures pleines et creuses, paiements à encaisser.",
  'aud.clubs.f4.title': 'Une vitrine pour votre club',
  'aud.clubs.f4.body': 'Photos, description et position sur la carte, visibles par tous les joueurs.',
  'aud.clubs.cta': 'Digitaliser mon club',

  'trust.title': 'Ce que Moovi garantit',
  'trust.t1.title': 'Jamais deux joueurs sur le même créneau',
  'trust.t1.body': 'Chaque créneau est verrouillé par la base de données au moment de la réservation.',
  'trust.t2.title': 'Des clubs vérifiés',
  'trust.t2.body': "Chaque club est contrôlé par notre équipe, document d'immatriculation à l'appui, avant d'apparaître ici.",
  'trust.t3.title': 'Des prix clairs, en dinars',
  'trust.t3.body': 'Le prix affiché est le prix final, supplément de soirée compris. Pas de frais cachés.',
  'trust.t4.title': 'Vos données protégées',
  'trust.t4.body': 'Traitées selon la loi tunisienne n° 2004-63, jamais revendues. Suppression du compte en libre-service.',

  'disc.body':
    "Recherchez par club ou par lieu, choisissez votre sport, puis ouvrez un site pour voir ses terrains et ses disponibilités en direct.",
  'disc.searchPlaceholder': "Rechercher un club ou un site (ex. : « Padel Club La Marsa »)...",
  'disc.searchLabel': 'Rechercher un club ou un site',
  'disc.clearSearch': 'Effacer la recherche',
  'disc.nearest': 'Près de moi',
  'disc.locating': 'Localisation…',
  'disc.filterSport': 'Filtrer par sport',
  'disc.sport.all': 'Tous',
  'disc.count.one': '{n} club',
  'disc.count.other': '{n} clubs',
  'disc.nearestFirst': ' · les plus proches d’abord',
  'disc.geo.denied': "L'accès à la position a été refusé : les clubs sont classés par ordre alphabétique.",
  'disc.geo.timeout': 'La localisation a pris trop de temps. Veuillez réessayer.',
  'disc.geo.unavailable': 'Votre position est introuvable pour le moment.',
  'disc.geo.unsupported': 'Votre navigateur ne prend pas en charge la géolocalisation.',
  'disc.geo.unranked':
    "Aucun de ces clubs n'a encore partagé sa position sur la carte : impossible de les classer par distance.",
  'disc.failed.title': 'Impossible de charger les clubs pour le moment',
  'disc.failed.body': 'Veuillez actualiser la page dans un instant.',
  'disc.empty.title': "Aucun club n'est encore répertorié",
  'disc.empty.body':
    'Les clubs apparaissent ici dès qu’ils sont vérifiés et que leurs terrains sont configurés.',
  'disc.noMatch.title': 'Aucun club ne correspond à votre recherche',
  'disc.noMatch.body': 'Essayez un autre nom, un autre lieu ou un autre sport.',
  'disc.clearFilters': 'Réinitialiser les filtres',
  'disc.card.fromShort': 'dès',
  'disc.map.near': 'Près de vous',
  'disc.status.open': "Ouvert · jusqu'à {time}",
  'disc.status.opensAt': 'Fermé · ouvre à {time}',
  'disc.status.closed': 'Fermé',
  'disc.card.sports': 'Sports proposés',
  'disc.card.hours': "Horaires d'ouverture",
  'disc.card.courts': 'Terrains',
  'disc.card.openToday': "Ouvert aujourd'hui : {hours}",
  'disc.card.from': 'À partir de ',
  'disc.card.onRequest': 'Prix sur demande',
  'disc.card.book': 'Voir les créneaux et réserver',
  'disc.card.court.one': '{n} terrain de {sport}',
  'disc.card.court.other': '{n} terrains de {sport}',
  'disc.card.tunisia': 'Tunisie',

  'how.eyebrow': 'Comment ça marche',
  'how.title': 'De la recherche au match en quatre étapes',
  'how.s1.title': 'Choisissez un terrain',
  'how.s1.body': 'Sélectionnez votre sport et la zone où vous souhaitez jouer.',
  'how.s1.t1': 'Lieu',
  'how.s1.t2': 'Sport',
  'how.s2.title': 'Explorez les installations',
  'how.s2.body': 'Comparez ce que propose chaque complexe avant de vous décider.',
  'how.s2.t1': 'Type de surface',
  'how.s2.t2': 'Éclairage',
  'how.s2.t3': 'Équipements',
  'how.s3.title': 'Sélectionnez un créneau',
  'how.s3.body':
    'Consultez les disponibilités en direct dans la grille. Les créneaux réservés ou retenus sont clairement indiqués.',
  'how.s3.t1': 'Grille interactive',
  'how.s4.title': 'Confirmez et jouez',
  'how.s4.body':
    'Votre créneau est verrouillé dès la confirmation, avec le total affiché en TND.',
  'how.s4.t1': 'Verrouillage instantané',
  'how.s4.t2': 'Confirmation en TND',

  'footer.tagline': '© 2026 Moovi. Réservation de terrains de sport en Tunisie.',
  'footer.nav': 'Pied de page',
  'footer.clubs': 'Clubs',
  'footer.list': 'Référencer votre club',
  'footer.terms': 'Conditions',
  'footer.privacy': 'Confidentialité',
  'footer.cookies': 'Paramètres des cookies',

  'dash.nav': 'Tableau de bord du club',
  'dash.bookings': 'Réservations',
  'dash.analytics': 'Statistiques',
  'dash.courts': 'Terrains',
  'dash.settings': 'Paramètres',
  'dash.team': 'Équipe',
  'dash.tournaments': 'Tournois',
  'dash.security': 'Sécurité',
} as const

export type MessageKey = keyof typeof fr

/** Looks a key up and fills `{name}` placeholders. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const text: string = fr[key]
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match
  )
}
