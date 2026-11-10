import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let actif = true;
    api
      .get('/me')
      .then((data) => {
        if (actif) setUser(data.user);
      })
      .catch(() => {
        if (actif) setUser(null);
      })
      .finally(() => {
        if (actif) setLoading(false);
      });
    return () => {
      actif = false;
    };
  }, []);

  useEffect(() => {
    const deconnecter = () => setUser(null);
    window.addEventListener('farmotic:unauthorized', deconnecter);
    return () => window.removeEventListener('farmotic:unauthorized', deconnecter);
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/login', { username, password });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/logout');
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const contexte = useContext(AuthContext);
  if (!contexte) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return contexte;
}
