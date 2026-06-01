import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { Contact, ContactRole } from '../../types';
import Pagination from '../shared/Pagination';
import ContactFormModal from './ContactFormModal';
import { searchContacts } from '../../services/contatos/contactService';

interface ContactListProps {
  contacts: Contact[];
  role: ContactRole;
  onUpsert: (contacts: Contact[]) => void;
  onDelete: (ids: string[]) => void;
  userId: string;
}

const ContactList: React.FC<ContactListProps> = ({ contacts, role, onUpsert, onDelete, userId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  const filtered = useMemo(() => {
    const byRole = contacts.filter(c => c.role === role);
    const results = searchContacts(byRole, debouncedSearch);
    return results.sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [contacts, role, debouncedSearch]);

  const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleSave = (contact: Contact) => {
    onUpsert([contact]);
    setShowForm(false);
    setEditingContact(null);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Excluir este contato? Esta ação não pode ser desfeita.')) return;
    onDelete([id]);
  };

  const roleLabel = role === 'customer' ? 'cliente' : 'colaborador';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 py-3 shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder={`Buscar ${roleLabel}...`}
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
        </div>
        <button
          onClick={() => { setEditingContact(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold rounded-xl transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> Novo
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
        {slice.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
            {debouncedSearch ? 'Nenhum resultado encontrado.' : `Nenhum ${roleLabel} cadastrado.`}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-950 z-10">
              <tr className="text-xs text-slate-500 uppercase border-b border-slate-800">
                <th className="text-left py-2 pr-4 font-semibold">Nome</th>
                <th className="text-left py-2 pr-4 font-semibold hidden sm:table-cell">Documento</th>
                <th className="text-left py-2 pr-4 font-semibold hidden md:table-cell">Telefone</th>
                {role === 'collaborator' && (
                  <th className="text-left py-2 pr-4 font-semibold hidden lg:table-cell">Cargo</th>
                )}
                <th className="text-left py-2 font-semibold">Status</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {slice.map(c => (
                <tr key={c.id} className="group hover:bg-slate-800/30 transition-colors">
                  <td className="py-2.5 pr-4">
                    <span className="text-slate-200 font-medium">{c.name}</span>
                    {c.isDefault && (
                      <span className="ml-2 text-[10px] text-amber-500 font-bold uppercase">padrão</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-400 hidden sm:table-cell">{c.document || '—'}</td>
                  <td className="py-2.5 pr-4 text-slate-400 hidden md:table-cell">{c.phone || '—'}</td>
                  {role === 'collaborator' && (
                    <td className="py-2.5 pr-4 text-slate-400 hidden lg:table-cell">{c.internalRole || '—'}</td>
                  )}
                  <td className="py-2.5">
                    <span className={`text-[11px] font-bold ${c.isEnabled ? 'text-emerald-400' : 'text-slate-600'}`}>
                      {c.isEnabled ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingContact(c); setShowForm(true); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-all"
                        title="Editar"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {!c.isDefault && (
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        total={filtered.length}
        page={page}
        pageSize={pageSize}
        onPageChange={p => setPage(p)}
        onPageSizeChange={s => { setPageSize(s); setPage(1); }}
      />

      {showForm && (
        <ContactFormModal
          contact={editingContact}
          role={role}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingContact(null); }}
          userId={userId}
        />
      )}
    </div>
  );
};

export default ContactList;
