import React from 'react';
import { Trash2, AlertTriangle, Info, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES = {
  danger:  { icon: Trash2,        iconClass: 'text-red-400',    btnClass: 'bg-red-700 hover:bg-red-600',    borderClass: 'border-red-900/50' },
  warning: { icon: AlertTriangle, iconClass: 'text-amber-400',  btnClass: 'bg-amber-700 hover:bg-amber-600', borderClass: 'border-amber-900/50' },
  info:    { icon: Info,          iconClass: 'text-blue-400',   btnClass: 'bg-blue-700 hover:bg-blue-600',  borderClass: 'border-blue-900/50' },
};

export default function ConfirmDialog({
  isOpen, title, message,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  variant = 'info', onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const { icon: Icon, iconClass, btnClass, borderClass } = VARIANT_STYLES[variant];

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className={`bg-slate-900 border ${borderClass} rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-150`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <Icon className={`w-5 h-5 shrink-0 ${iconClass}`} />
            <h3 className="text-white font-bold text-base">{title}</h3>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-slate-400 text-sm mb-6 leading-relaxed">{message}</p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-slate-300 hover:bg-slate-800 font-semibold text-sm transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl ${btnClass} text-white font-bold text-sm transition-colors flex items-center gap-2`}
          >
            <Icon className="w-4 h-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
