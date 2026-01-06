import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

export const Button = ({ children, onClick, variant = 'primary', className = '', icon: Icon, disabled, loading, title }) => {
  const variants = {
    primary: 'bg-black text-white hover:bg-zinc-800 disabled:bg-zinc-400',
    secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
    ghost: 'hover:bg-zinc-100 text-zinc-600',
    danger: 'bg-red-50 text-red-600 hover:bg-red-100',
    outline: 'border border-zinc-200 hover:bg-zinc-50 text-zinc-700'
  };
  return (
    <button 
      onClick={onClick} disabled={disabled || loading} title={title}
      className={`flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all active:scale-95 font-medium disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    >
      {loading ? <Loader2 className="animate-spin" size={18} /> : Icon && <Icon size={18} />}
      {children}
    </button>
  );
};

export const Card = ({ children, className = "", onClick, style }) => (
  <div onClick={onClick} style={style} className={`bg-white border border-zinc-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all ${className}`}>
    {children}
  </div>
);

export const ConfirmModal = ({ isOpen, onClose, onConfirm, message, title = "Confirm Deletion" }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 text-red-500">
          <AlertCircle size={24} />
          <h3 className="text-lg font-bold text-zinc-900">{title}</h3>
        </div>
        <p className="text-zinc-500 text-sm">{message}</p>
        <div className="flex gap-3 justify-end mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
};
