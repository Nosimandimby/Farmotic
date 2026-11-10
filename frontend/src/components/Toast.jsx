import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [messages, setMessages] = useState([]);

  const push = useCallback((texte, type = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setMessages((liste) => [...liste, { id, texte, type }]);
    setTimeout(() => {
      setMessages((liste) => liste.filter((message) => message.id !== id));
    }, 4000);
  }, []);

  const valeur = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={valeur}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${
              message.type === 'error'
                ? 'bg-rose-600 text-white ring-rose-700/30'
                : 'bg-brand-800 text-white ring-brand-900/30'
            }`}
          >
            {message.type === 'error' ? (
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1 leading-snug">{message.texte}</span>
            <button
              type="button"
              onClick={() =>
                setMessages((liste) => liste.filter((m) => m.id !== message.id))
              }
              className="rounded p-0.5 opacity-70 transition hover:opacity-100"
              aria-label="Fermer la notification"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
