/* Hook React — thème de couleurs de ranges (système partagé).
   S'abonne aux changements pour une mise à jour LIVE de toutes les matrices
   et légendes ouvertes (§5/§7). */
import { useState, useEffect } from "react";
import { resolveRangeTheme, subscribeRangeTheme } from "../../rangeColorTheme.js";

export function useRangeTheme(moduleId="replayer"){
  const [theme,setTheme] = useState(()=>resolveRangeTheme(moduleId));
  useEffect(()=>{
    setTheme(resolveRangeTheme(moduleId));
    return subscribeRangeTheme(()=>setTheme(resolveRangeTheme(moduleId)));
  },[moduleId]);
  return theme;
}
