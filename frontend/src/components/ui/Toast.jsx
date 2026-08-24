import React from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export function ToastItem({ toast, onDismiss }) {
  const icons = {
    success: CheckCircle2,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const Icon = icons[toast.type] || Info;

  const styles = {
    success: "bg-emerald-900/90 border-emerald-700 text-white",
    error: "bg-red-900/90 border-red-700 text-white",
    warning: "bg-amber-900/90 border-amber-700 text-white",
    info: "bg-stone-900/90 border-stone-700 text-white",
  };

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-md transition-all duration-300 transform animate-in slide-in-from-bottom-5 ${
        styles[toast.type] || styles.info
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      <div className="text-sm font-medium pr-2">{toast.message}</div>
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className="text-xs underline font-bold hover:text-amber-300 shrink-0"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={() => onDismiss(toast.id)}
        className="p-1 rounded-full text-white/70 hover:text-white transition-colors ml-auto shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default ToastItem;
