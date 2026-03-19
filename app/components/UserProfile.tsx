import React, { useState } from 'react';
import { UserProfile as UserProfileType, DeliveryAddress } from '../types';
import { User, Building2, Hash, Mail, MapPin, Plus, Pencil, Trash2, Star, Check, X, ExternalLink } from 'lucide-react';

interface UserProfileProps {
  profile: UserProfileType;
  onProfileChange: (profile: UserProfileType) => void;
  userPhotoURL?: string;
  userEmail?: string;
}

const DEFAULT_ADDRESS: Omit<DeliveryAddress, 'id'> = { label: '', address: '', isDefault: false };

const UserProfilePanel: React.FC<UserProfileProps> = ({
  profile,
  onProfileChange,
  userPhotoURL,
  userEmail,
}) => {
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressDraft, setAddressDraft] = useState<Omit<DeliveryAddress, 'id'>>(DEFAULT_ADDRESS);
  const [addingNew, setAddingNew] = useState(false);
  const [newAddressDraft, setNewAddressDraft] = useState<Omit<DeliveryAddress, 'id'>>(DEFAULT_ADDRESS);

  // ── helpers ──────────────────────────────────────────────────────────────

  const updateField = (field: keyof UserProfileType, value: string) => {
    onProfileChange({ ...profile, [field]: value });
  };

  const openMaps = (address: string) => {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank');
  };

  // ── address CRUD ─────────────────────────────────────────────────────────

  const startEdit = (addr: DeliveryAddress) => {
    setEditingAddressId(addr.id);
    setAddressDraft({ label: addr.label, address: addr.address, isDefault: addr.isDefault });
  };

  const cancelEdit = () => {
    setEditingAddressId(null);
    setAddressDraft(DEFAULT_ADDRESS);
  };

  const saveEdit = () => {
    if (!addressDraft.label.trim() || !addressDraft.address.trim()) return;
    onProfileChange({
      ...profile,
      deliveryAddresses: profile.deliveryAddresses.map(a =>
        a.id === editingAddressId ? { ...a, ...addressDraft } : a
      ),
    });
    cancelEdit();
  };

  const removeAddress = (id: string) => {
    onProfileChange({
      ...profile,
      deliveryAddresses: profile.deliveryAddresses.filter(a => a.id !== id),
    });
  };

  const setDefault = (id: string) => {
    onProfileChange({
      ...profile,
      deliveryAddresses: profile.deliveryAddresses.map(a => ({
        ...a,
        isDefault: a.id === id,
      })),
    });
  };

  const addAddress = () => {
    if (!newAddressDraft.label.trim() || !newAddressDraft.address.trim()) return;
    const isFirst = profile.deliveryAddresses.length === 0;
    const newAddr: DeliveryAddress = {
      id: crypto.randomUUID(),
      label: newAddressDraft.label.trim(),
      address: newAddressDraft.address.trim(),
      isDefault: isFirst || newAddressDraft.isDefault,
    };
    // Se marcado como padrão, remover padrão dos outros
    const updated = newAddr.isDefault
      ? profile.deliveryAddresses.map(a => ({ ...a, isDefault: false }))
      : profile.deliveryAddresses;

    onProfileChange({ ...profile, deliveryAddresses: [...updated, newAddr] });
    setNewAddressDraft(DEFAULT_ADDRESS);
    setAddingNew(false);
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-4 py-2">

      {/* ── Identificação ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800">
          <User className="w-4 h-4 text-amber-400" />
          <p className="text-white font-semibold text-sm">Identificação</p>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Avatar + nome Google */}
          {(userPhotoURL || userEmail) && (
            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
              {userPhotoURL && (
                <img src={userPhotoURL} alt="avatar" className="w-10 h-10 rounded-full border border-slate-600" />
              )}
              <div>
                <p className="text-white text-sm font-medium">{userEmail}</p>
                <p className="text-slate-500 text-xs">Conta Google vinculada</p>
              </div>
            </div>
          )}

          {/* Nome do comprador */}
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">
              <span className="flex items-center gap-1.5"><User className="w-3 h-3" /> Nome do Comprador</span>
            </label>
            <input
              type="text"
              value={profile.displayName || ''}
              onChange={e => updateField('displayName', e.target.value)}
              placeholder="Seu nome"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Nome da empresa */}
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">
              <span className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Nome da Empresa</span>
            </label>
            <input
              type="text"
              value={profile.companyName || ''}
              onChange={e => updateField('companyName', e.target.value)}
              placeholder="BeerHouse"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <p className="text-slate-600 text-xs mt-1">Usado na variável [EMPRESA] dos templates de pedido</p>
          </div>

          {/* CPF / CNPJ */}
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">
              <span className="flex items-center gap-1.5"><Hash className="w-3 h-3" /> CPF / CNPJ</span>
            </label>
            <input
              type="text"
              value={profile.document || ''}
              onChange={e => updateField('document', e.target.value)}
              placeholder="00.000.000/0001-00"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <p className="text-slate-600 text-xs mt-1">Usado na variável [CNPJ] dos templates</p>
          </div>

          {/* Email de contato */}
          <div>
            <label className="text-slate-400 text-xs font-medium block mb-1.5">
              <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> E-mail de Contato</span>
            </label>
            <input
              type="email"
              value={profile.email || ''}
              onChange={e => updateField('email', e.target.value)}
              placeholder="compras@beerhouse.com.br"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <p className="text-slate-600 text-xs mt-1">Usado na variável [EMAIL] dos templates e quick notes</p>
          </div>
        </div>
      </div>

      {/* ── Endereços de Entrega ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <MapPin className="w-4 h-4 text-amber-400" />
            <div>
              <p className="text-white font-semibold text-sm">Endereços de Entrega</p>
              <p className="text-slate-500 text-xs mt-0.5">Locais onde você recebe mercadoria</p>
            </div>
          </div>
          <button
            onClick={() => { setAddingNew(true); setNewAddressDraft(DEFAULT_ADDRESS); }}
            className="flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Adicionar
          </button>
        </div>

        <div className="divide-y divide-slate-800">

          {/* Lista de endereços */}
          {profile.deliveryAddresses.length === 0 && !addingNew && (
            <p className="text-slate-600 text-sm text-center py-8">Nenhum endereço cadastrado</p>
          )}

          {profile.deliveryAddresses.map(addr => (
            <div key={addr.id} className="px-5 py-4">
              {editingAddressId === addr.id ? (
                /* ── Modo edição inline ── */
                <div className="space-y-2">
                  <input
                    type="text"
                    value={addressDraft.label}
                    onChange={e => setAddressDraft(d => ({ ...d, label: e.target.value }))}
                    placeholder="Rótulo (ex: Loja Centro)"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={addressDraft.address}
                    onChange={e => setAddressDraft(d => ({ ...d, address: e.target.value }))}
                    placeholder="Endereço completo"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!addressDraft.isDefault}
                        onChange={e => setAddressDraft(d => ({ ...d, isDefault: e.target.checked }))}
                        className="accent-amber-500"
                      />
                      <span className="text-slate-400 text-xs">Endereço padrão</span>
                    </label>
                    <div className="flex gap-2">
                      <button onClick={cancelEdit} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-700 transition-all">
                        <X className="w-4 h-4" />
                      </button>
                      <button onClick={saveEdit} className="p-1.5 text-emerald-400 hover:text-emerald-300 rounded-lg hover:bg-emerald-900/20 transition-all">
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Modo leitura ── */
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-white text-sm font-medium">{addr.label}</p>
                      {addr.isDefault && (
                        <span className="flex items-center gap-0.5 text-amber-500 text-[10px] font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                          <Star className="w-2.5 h-2.5" /> Padrão
                        </span>
                      )}
                    </div>
                    <p className="text-slate-400 text-xs mt-0.5 break-words">{addr.address}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openMaps(addr.address)}
                      className="p-1.5 text-slate-500 hover:text-blue-400 rounded-lg hover:bg-blue-900/20 transition-all"
                      title="Abrir no Maps"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    {!addr.isDefault && (
                      <button
                        onClick={() => setDefault(addr.id)}
                        className="p-1.5 text-slate-500 hover:text-amber-400 rounded-lg hover:bg-amber-900/20 transition-all"
                        title="Definir como padrão"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => startEdit(addr)}
                      className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-700 transition-all"
                      title="Editar"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remover "${addr.label}"?`)) removeAddress(addr.id);
                      }}
                      className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-900/20 transition-all"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── Formulário de novo endereço ── */}
          {addingNew && (
            <div className="px-5 py-4 bg-slate-800/30">
              <p className="text-slate-400 text-xs font-medium mb-2">Novo endereço</p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newAddressDraft.label}
                  onChange={e => setNewAddressDraft(d => ({ ...d, label: e.target.value }))}
                  placeholder="Rótulo (ex: Loja Centro)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  autoFocus
                />
                <input
                  type="text"
                  value={newAddressDraft.address}
                  onChange={e => setNewAddressDraft(d => ({ ...d, address: e.target.value }))}
                  placeholder="Endereço completo para Maps"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!newAddressDraft.isDefault}
                      onChange={e => setNewAddressDraft(d => ({ ...d, isDefault: e.target.checked }))}
                      className="accent-amber-500"
                    />
                    <span className="text-slate-400 text-xs">Definir como padrão</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setAddingNew(false); setNewAddressDraft(DEFAULT_ADDRESS); }}
                      className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-slate-700 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={addAddress}
                      disabled={!newAddressDraft.label.trim() || !newAddressDraft.address.trim()}
                      className="flex items-center gap-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" /> Salvar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default UserProfilePanel;
