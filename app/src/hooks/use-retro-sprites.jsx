import { createContext, useContext, useState, useEffect } from 'react';
import { STORAGE_KEYS, getBool, setBool } from '../utils/storage';

const RetroContext = createContext({ retro: false, setRetro: () => {} });

export function RetroProvider({ children }) {
  const [retro, setRetro] = useState(() => getBool(STORAGE_KEYS.RETRO_SPRITES, false));
  useEffect(() => {
    setBool(STORAGE_KEYS.RETRO_SPRITES, retro);
    document.documentElement.setAttribute('data-retro', retro ? 'true' : 'false');
  }, [retro]);
  return (
    <RetroContext.Provider value={{ retro, setRetro }}>
      {children}
    </RetroContext.Provider>
  );
}

export function useRetroSprites() {
  return useContext(RetroContext);
}
