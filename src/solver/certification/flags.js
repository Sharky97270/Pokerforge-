/* ══════════════════════════════════════════════════════════════════════════
   SHARKSOLVER — CERTIFICATION · FEATURE FLAGS (§13)

   Tout ce que l'audit de certification ajoute est DÉSACTIVÉ par défaut. Tant que ces
   drapeaux sont à false :
     · le Trainer et le Replayer se comportent exactement comme avant ;
     · les layouts 1T à 4T ne changent pas ;
     · aucune API existante ne change de forme ;
     · aucune session enregistrée ne devient illisible.

   Les nouveaux champs d'API sont AJOUTÉS, jamais substitués : un consommateur qui
   ignore la certification continue de lire les mêmes champs qu'avant.

   Lecture depuis `import.meta.env` (Vite) avec repli sur `process.env` pour que les
   suites de tests Node puissent piloter les drapeaux. Défaut : false partout — un
   drapeau absent ou mal orthographié laisse donc le produit dans son état actuel,
   ce qui est le comportement sûr.
════════════════════════════════════════════════════════════════════════════ */

function readEnv(name) {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && name in import.meta.env) {
      return import.meta.env[name];
    }
  } catch { /* environnement sans import.meta.env */ }
  try {
    if (typeof process !== "undefined" && process.env && name in process.env) {
      return process.env[name];
    }
  } catch { /* pas de process */ }
  return undefined;
}

/* Seules les valeurs explicitement vraies activent un drapeau. Toute autre valeur —
   absente, vide, "0", "false", faute de frappe — laisse le drapeau désactivé. */
function isEnabled(name) {
  const v = readEnv(name);
  if (v === true) return true;
  if (typeof v === "string") return /^(1|true|yes|on)$/i.test(v.trim());
  return false;
}

export const FLAG_NAMES = {
  CERTIFICATION_UI: "SHARKSOLVER_CERTIFICATION_UI",
  RANGE_LIBRARY: "SHARKSOLVER_RANGE_LIBRARY",
  TRUST_BADGES: "SHARKSOLVER_TRUST_BADGES",
};

/* Lecture à l'appel (et non figée au chargement) : les tests peuvent ainsi basculer
   un drapeau sans recharger le module. */
export const certificationFlags = {
  get certificationUI() { return isEnabled(FLAG_NAMES.CERTIFICATION_UI); },
  get rangeLibrary() { return isEnabled(FLAG_NAMES.RANGE_LIBRARY); },
  get trustBadges() { return isEnabled(FLAG_NAMES.TRUST_BADGES); },
};

/* Instantané pour le diagnostic / le rapport d'audit. */
export function flagsSnapshot() {
  return {
    [FLAG_NAMES.CERTIFICATION_UI]: certificationFlags.certificationUI,
    [FLAG_NAMES.RANGE_LIBRARY]: certificationFlags.rangeLibrary,
    [FLAG_NAMES.TRUST_BADGES]: certificationFlags.trustBadges,
  };
}
