import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const DEFAUT = { devise: 'MGA', symbole_devise: 'Ar', seuil_mortalite_alerte: 5 };

const SettingsContext = createContext({
  settings: DEFAUT,
  refresh: () => {},
});

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState(DEFAUT);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/settings');
      setSettings(data);
      return data;
    } catch {
      return DEFAUT;
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  return (
    <SettingsContext.Provider value={{ settings, setSettings, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
