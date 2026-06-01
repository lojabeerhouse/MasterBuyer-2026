import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { Contact, ContactRole } from '../../types';

interface ContactFormModalProps {
  contact: Contact | null;
  role: ContactRole;
  onSave: (contact: Contact) => void;
  onClose: () => void;
  userId: string;
}

const ContactFormModal: React.FC<ContactFormModalProps> = ({ contact, role, onSave, onClose, userId }) => {
  const isNew = !contact;
  const [name, setName] = useState(contact?.name || '');
  const [document, setDocument] = useState(contact?.document || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [address, setAddress] = useState(contact?.address || '');
  const [internalRole, setInternalRole] = useState(contact?.internalRole || '');
  const [isEnabled, setIsEnabled] = useState(contact?.isEnabled ?? true);

  const handleSave = () => {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const saved: Contact = {
      id: contact?.id || crypto.randomUUID(),
      role,
      name: name.trim(),
      isEnabled,
      isDefault: contact?.isDefault,
      document: document.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      internalRole: role === 'collaborator' ? internalRole.trim() || undefined : undefined,
      createdAt: contact?.createdAt || now,
      updatedAt: now,
      createdBy: contact?.createdBy || userId,
    };
    onSave(saved);
  };

  const labelCls = 'block text-[11px] text-slate-400 mb-1 font-semibold uppercase tracking-wide';
  const inputCls = 'w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors';

  const roleLabel = role === 'customer' ? 'Cliente' : 'Colaborador';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white">
            {isNew ? `Novo ${roleLabel}` : `Editar ${roleLabel}`}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div>
            <label className={labelCls}>Nome *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={role === 'customer' ? 'Nome do cliente' : 'Nome do colaborador'}
              autoFocus
              disabled={contact?.isDefault}
              className={`${inputCls} ${contact?.isDefault ? 'opacity-50 cursor-not-allowed' : ''}`}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
            />
            {contact?.isDefault && (
              <p className="text-[11px] text-amber-500 mt-1">Nome reservado — não pode ser alterado.</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Documento (CPF/CNPJ)</label>
            <input
              type="text"
              value={document}
              onChange={e => setDocument(e.target.value)}
              placeholder="000.000.000-00"
              className={inputCls}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Telefone</label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(44) 99999-9999"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="contato@email.com"
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Endereço</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Rua, número, cidade"
              className={inputCls}
            />
          </div>

          {role === 'collaborator' && (
            <div>
              <label className={labelCls}>Cargo / Função</label>
              <input
                type="text"
                value={internalRole}
                onChange={e => setInternalRole(e.target.value)}
                placeholder="Ex: Vendedor, Caixa, Gerente"
                className={inputCls}
              />
            </div>
          )}

          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-300 font-medium">Ativo</span>
            <button
              type="button"
              onClick={() => setIsEnabled(v => !v)}
              disabled={contact?.isDefault}
              className={`relative w-10 h-5 rounded-full transition-colors ${isEnabled ? 'bg-emerald-600' : 'bg-slate-700'} ${contact?.isDefault ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm text-slate-400 hover:text-white transition-colors font-medium rounded-xl hover:bg-slate-800"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContactFormModal;
