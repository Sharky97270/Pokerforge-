export const LEGAL_VERSION = "2026-06-28";

export const LEGAL_CONFIG = {
  brand: "PokerForge",
  site: "www.pokerforge.com",
  legalName: "A completer avant mise en production",
  legalForm: "A completer avant mise en production",
  address: "A completer avant mise en production",
  registration: "A completer avant mise en production",
  vatNumber: "A completer si applicable",
  publicationDirector: "A completer avant mise en production",
  contactEmail: "A completer avant mise en production",
  contactPhone: "A completer avant mise en production",
  hostName: "A completer avant mise en production",
  hostAddress: "A completer avant mise en production",
  hostPhone: "A completer avant mise en production",
  mediator: "A completer avant toute offre payante aux consommateurs",
};

const identityFields = [
  `Editeur : ${LEGAL_CONFIG.legalName}`,
  `Forme juridique : ${LEGAL_CONFIG.legalForm}`,
  `Adresse du siege : ${LEGAL_CONFIG.address}`,
  `Immatriculation : ${LEGAL_CONFIG.registration}`,
  `Numero de TVA : ${LEGAL_CONFIG.vatNumber}`,
  `Directeur de la publication : ${LEGAL_CONFIG.publicationDirector}`,
  `E-mail : ${LEGAL_CONFIG.contactEmail}`,
  `Telephone : ${LEGAL_CONFIG.contactPhone}`,
];

export const LEGAL_DOCUMENTS = [
  {
    id: "mentions",
    shortTitle: "Mentions legales",
    title: "Mentions legales",
    summary: "Identification de l'editeur, de l'hebergeur et informations relatives au site.",
    status: "incomplete",
    statusLabel: "Informations editeur a completer",
    sections: [
      {
        title: "1. Editeur",
        paragraphs: [`Le site ${LEGAL_CONFIG.site} et l'application ${LEGAL_CONFIG.brand} sont edites par l'entite indiquee ci-dessous.`],
        bullets: identityFields,
      },
      {
        title: "2. Hebergement",
        paragraphs: ["L'infrastructure publique de l'application doit etre rattachee a l'hebergeur effectivement utilise en production."],
        bullets: [
          `Hebergeur : ${LEGAL_CONFIG.hostName}`,
          `Adresse : ${LEGAL_CONFIG.hostAddress}`,
          `Telephone : ${LEGAL_CONFIG.hostPhone}`,
        ],
      },
      {
        title: "3. Objet du service",
        paragraphs: [
          `${LEGAL_CONFIG.brand} est un outil d'entrainement, d'analyse et de progression destine aux joueurs de poker. Il ne propose pas de jeu d'argent, ne collecte pas de mises et ne garantit aucun gain.`,
          "Les simulations, ranges, analyses GTO et reponses assistees par intelligence artificielle sont fournies a des fins pedagogiques. Elles ne constituent ni un conseil financier ni une incitation a jouer.",
        ],
      },
      {
        title: "4. Propriete intellectuelle",
        paragraphs: [
          `La marque ${LEGAL_CONFIG.brand}, l'interface, les textes, graphismes, bases de donnees et logiciels sont proteges par les droits de propriete intellectuelle applicables. Toute reproduction non autorisee est interdite.`,
          "Les marques, logos et contenus de tiers restent la propriete de leurs titulaires respectifs.",
        ],
      },
    ],
  },
  {
    id: "cgu",
    shortTitle: "CGU",
    title: "Conditions generales d'utilisation",
    summary: "Regles d'acces et d'utilisation de PokerForge.",
    sections: [
      {
        title: "1. Objet et acceptation",
        paragraphs: [
          `Les presentes conditions encadrent l'acces a ${LEGAL_CONFIG.brand}. En creant un compte ou en utilisant le service, l'utilisateur reconnait les avoir lues et acceptees dans leur version en vigueur.`,
          `Version applicable : ${LEGAL_VERSION}.`,
        ],
      },
      {
        title: "2. Compte utilisateur",
        paragraphs: [
          "L'utilisateur fournit des informations exactes, conserve ses identifiants confidentiels et signale toute utilisation non autorisee de son compte.",
          "Un compte est personnel. L'utilisateur est responsable des actions realisees depuis sa session, sauf preuve d'un acces frauduleux independant de sa volonte.",
        ],
      },
      {
        title: "3. Utilisation autorisee",
        paragraphs: ["L'utilisateur s'engage a utiliser le service loyalement et dans le respect des lois, des droits des tiers et des regles des plateformes de poker qu'il utilise."],
        bullets: [
          "Ne pas contourner les controles d'acces ou tenter d'extraire massivement les donnees.",
          "Ne pas perturber le service, injecter du code malveillant ou usurper l'identite d'un tiers.",
          "Ne pas utiliser PokerForge comme assistance en temps reel lorsqu'une room de poker l'interdit.",
          "Ne pas publier de contenu illicite, trompeur, haineux ou portant atteinte aux droits d'autrui.",
        ],
      },
      {
        title: "4. Outils d'analyse et intelligence artificielle",
        paragraphs: [
          "Les resultats du solver, du trainer et du Coach AI sont des aides pedagogiques susceptibles de comporter des approximations. L'utilisateur reste seul responsable de ses decisions.",
          "Aucun resultat, classement ou estimation ne constitue une promesse de performance ou de gain.",
        ],
      },
      {
        title: "5. Disponibilite et responsabilite",
        paragraphs: [
          "PokerForge s'efforce de maintenir le service accessible et securise, sans garantir une disponibilite continue. Des interruptions peuvent intervenir pour maintenance, securite ou cause exterieure.",
          "La responsabilite de l'editeur ne peut etre exclue dans les cas ou la loi l'interdit. Sous cette reserve, les dommages indirects et pertes resultant d'une decision de jeu prise par l'utilisateur ne sont pas imputables au service.",
        ],
      },
      {
        title: "6. Suspension, suppression et evolution",
        paragraphs: [
          "L'acces peut etre suspendu en cas de violation grave, de risque de securite ou d'usage frauduleux, apres information lorsque les circonstances le permettent.",
          "Les conditions peuvent evoluer. Une modification substantielle est portee a la connaissance des utilisateurs avant son entree en vigueur lorsque cela est requis.",
        ],
      },
      {
        title: "7. Donnees, cookies et droit applicable",
        paragraphs: [
          "Le traitement des donnees personnelles est decrit dans la Politique de confidentialite. Les stockages locaux et traceurs sont decrits dans la Politique cookies.",
          "Les presentes conditions sont soumises au droit francais, sans priver un consommateur des protections imperatives dont il beneficie. Les voies amiables doivent etre privilegiees avant toute action judiciaire.",
        ],
      },
    ],
  },
  {
    id: "privacy",
    shortTitle: "Confidentialite",
    title: "Politique de confidentialite",
    summary: "Donnees traitees, finalites, destinataires et droits des utilisateurs.",
    status: "incomplete",
    statusLabel: "Responsable et contact a completer",
    sections: [
      {
        title: "1. Responsable du traitement",
        paragraphs: [
          `Le responsable du traitement est ${LEGAL_CONFIG.legalName}, joignable a l'adresse ${LEGAL_CONFIG.contactEmail}.`,
          "Ces coordonnees doivent etre completees avec l'identite reelle de l'editeur avant la mise en production publique.",
        ],
      },
      {
        title: "2. Donnees traitees",
        bullets: [
          "Compte : adresse e-mail, pseudo, identifiant technique, date de creation et informations de connexion.",
          "Progression : exercices, statistiques, objectifs, preferences et historique de mains volontairement importe.",
          "Technique : donnees de session, journaux de securite et informations necessaires au diagnostic.",
          "Fonctions IA : prompts, mains et contexte transmis uniquement lorsque l'utilisateur sollicite une analyse assistee.",
          "Stockage local : preferences d'interface et progression conservees sur l'appareil lorsque la synchronisation cloud n'est pas utilisee.",
        ],
      },
      {
        title: "3. Finalites et bases legales",
        bullets: [
          "Creer et securiser le compte, fournir le trainer et synchroniser la progression : execution du service demande.",
          "Repondre aux demandes d'assistance et prevenir la fraude : interet legitime de securite et de support.",
          "Respecter les obligations administratives ou judiciaires : obligation legale.",
          "Utiliser d'eventuels traceurs non essentiels ou envoyer des communications facultatives : consentement prealable lorsque requis.",
        ],
      },
      {
        title: "4. Destinataires et sous-traitants",
        paragraphs: ["Les donnees ne sont pas vendues. Elles sont accessibles aux personnes habilitees et aux prestataires strictement necessaires au service."],
        bullets: [
          "Supabase : authentification, base de donnees et fonctions serveur.",
          "OpenAI ou Anthropic : traitement des demandes IA lorsque la fonction concernee est utilisee, selon la configuration active.",
          "Google ou Apple : authentification sociale uniquement si l'utilisateur choisit ce mode de connexion.",
          "Google Fonts : chargement de polices lorsque le navigateur accede aux ressources distantes configurees.",
        ],
      },
      {
        title: "5. Durees de conservation",
        paragraphs: [
          "Les donnees de compte et de progression cloud sont conservees pendant la vie du compte puis supprimees ou anonymisees selon les obligations applicables et les sauvegardes techniques.",
          "Les donnees locales restent sur l'appareil jusqu'a leur effacement par l'utilisateur, la reinitialisation de l'application ou la suppression des donnees du navigateur. Les journaux et donnees traites par les prestataires suivent leurs parametres contractuels applicables.",
        ],
      },
      {
        title: "6. Transferts hors Union europeenne",
        paragraphs: [
          "Certains prestataires techniques peuvent traiter des donnees hors de l'Espace economique europeen. L'editeur doit verifier et documenter les garanties applicables, notamment les decisions d'adequation ou clauses contractuelles types, avant la mise en production.",
        ],
      },
      {
        title: "7. Vos droits",
        paragraphs: [
          `Vous pouvez demander l'acces, la rectification, l'effacement, la limitation, l'opposition ou la portabilite de vos donnees, selon les conditions legales, en ecrivant a ${LEGAL_CONFIG.contactEmail}. Vous pouvez retirer un consentement a tout moment sans affecter la licite du traitement anterieur.`,
          "Vous pouvez egalement introduire une reclamation aupres de la CNIL. Une verification raisonnable d'identite peut etre demandee pour proteger le compte.",
        ],
      },
      {
        title: "8. Securite et mineurs",
        paragraphs: [
          "Des mesures techniques et organisationnelles sont appliquees pour limiter les acces non autorises, pertes ou alterations. Aucun systeme ne pouvant garantir un risque nul, les incidents sont traites conformement aux obligations applicables.",
          "PokerForge est un outil lie au poker. Il n'est pas destine a encourager les mineurs a participer a des jeux d'argent et doit etre utilise dans le respect de l'age legal applicable.",
        ],
      },
    ],
  },
  {
    id: "cookies",
    shortTitle: "Cookies",
    title: "Politique cookies et stockage local",
    summary: "Fonctionnement des sessions, preferences et traceurs de l'application.",
    sections: [
      {
        title: "1. Situation actuelle",
        paragraphs: [
          "Dans sa version actuelle, PokerForge n'installe pas de traceur publicitaire ni de mesure d'audience non essentielle. L'application utilise des mecanismes indispensables a la session et du stockage local pour memoriser les preferences et la progression.",
          "En l'absence de traceur soumis au consentement, aucun bandeau d'acceptation publicitaire n'est affiche. Cette politique devra etre revue avant tout ajout d'outil d'analytics, de ciblage ou de publicite.",
        ],
      },
      {
        title: "2. Stockages utilises",
        bullets: [
          "Session d'authentification Supabase : maintien de la connexion et securisation du compte.",
          "Preferences PokerForge : style des cartes, theme des jetons, accessibilite et autres choix d'interface.",
          "Progression locale : statistiques, historique d'entrainement et configuration sur l'appareil.",
          "Etat technique temporaire : navigation, reprise de session et prevention des pertes de saisie.",
        ],
      },
      {
        title: "3. Gestion",
        paragraphs: [
          "L'utilisateur peut effacer les donnees du site depuis les reglages de son navigateur. Cette operation peut le deconnecter, reinitialiser ses preferences ou supprimer une progression non synchronisee.",
          "Si des traceurs non essentiels sont ajoutes, PokerForge proposera un choix prealable permettant d'accepter ou de refuser avec la meme simplicite, ainsi qu'un moyen permanent de modifier ce choix.",
        ],
      },
    ],
  },
  {
    id: "cgv",
    shortTitle: "CGV",
    title: "Conditions generales de vente",
    summary: "Cadre a finaliser avant le lancement d'une offre payante.",
    status: "draft",
    statusLabel: "Aucune offre payante active - document preparatoire",
    sections: [
      {
        title: "1. Perimetre actuel",
        paragraphs: [
          "Aucune offre payante, aucun abonnement et aucun paiement ne sont actuellement proposes dans cette version de PokerForge. Les presentes rubriques constituent une structure preparatoire et ne doivent pas etre publiees comme CGV definitives avant validation des prix, du vendeur et du parcours de paiement.",
        ],
      },
      {
        title: "2. Elements a renseigner avant commercialisation",
        bullets: [
          "Identite complete du vendeur, contact, immatriculation et TVA.",
          "Description exacte de chaque formule, fonctionnalites incluses et prerequis techniques.",
          "Prix toutes taxes comprises, periodicite, moyens de paiement et date de prelevement.",
          "Duree, renouvellement, conditions de resiliation et bouton de resiliation en ligne.",
          "Date d'execution du service et assistance disponible.",
          "Droit de retractation de 14 jours et, pour une execution immediate, recueil separe de la demande expresse et de la renonciation lorsque la loi le permet.",
          "Garanties legales applicables aux services et contenus numeriques.",
          `Mediateur de la consommation : ${LEGAL_CONFIG.mediator}.`,
        ],
      },
      {
        title: "3. Validation requise",
        paragraphs: [
          "Les CGV definitives devront correspondre au fonctionnement reel du checkout, du renouvellement, des remboursements, de la facturation et de la suppression d'abonnement. Elles devront etre acceptees avant la commande et rester telechargeables ou imprimables.",
        ],
      },
    ],
  },
];

export function getLegalDocument(id) {
  return LEGAL_DOCUMENTS.find((doc) => doc.id === id) || LEGAL_DOCUMENTS[0];
}
