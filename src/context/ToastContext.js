import React, { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const scheduleAutoDismiss = useCallback(
    (id, type) => {
      if (timers.current[id]) clearTimeout(timers.current[id]);
      if (type === "pending") return; // pending toasts stay until explicitly updated
      const delay = type === "error" ? 7000 : 4500;
      timers.current[id] = setTimeout(() => dismiss(id), delay);
    },
    [dismiss]
  );

  // notify({ type: 'pending' | 'success' | 'error', message }) -> returns an id
  const notify = useCallback(
    ({ type = "pending", message }) => {
      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, type, message }]);
      scheduleAutoDismiss(id, type);
      return id;
    },
    [scheduleAutoDismiss]
  );

  // update(id, { type, message }) -> moves an existing toast to a new stage
  const update = useCallback(
    (id, { type, message }) => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, type, message } : t)));
      scheduleAutoDismiss(id, type);
    },
    [scheduleAutoDismiss]
  );

  return (
    <ToastContext.Provider value={{ notify, update, dismiss }}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <div className="toast-icon">
              {t.type === "pending" && <span className="toast-spinner" />}
              {t.type === "success" && "✓"}
              {t.type === "error" && "!"}
            </div>
            <div className="toast-message">{t.message}</div>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
