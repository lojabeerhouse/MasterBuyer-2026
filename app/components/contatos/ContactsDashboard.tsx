import React, { useState, lazy, Suspense } from 'react';
import { Users, UserCheck } from 'lucide-react';
import { Contact } from '../../types';

const ContactList = lazy(() => import('./ContactList'));

interface ContactsDashboardProps {
  contacts: Contact[];
  onUpsert: (contacts: Contact[]) => void;
  onDelete: (ids: string[]) => void;
  userId: string;
}

const ContactsDashboard: React.FC<ContactsDashboardProps> = ({ contacts, onUpsert, onDelete, userId }) => {
  const [subTab, setSubTab] = useState<'customers' | 'collaborators'>('customers');

  const tabBase = 'px-4 py-2.5 flex items-center gap-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all border';
  const tabActive = 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/30';
  const tabIdle = 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-slate-800/70';

  return (
    <div className="flex flex-col h-full fade-in">
      <div className="flex gap-2 shrink-0 border-b border-slate-800/50 pb-3 mb-1">
        <button
          onClick={() => setSubTab('customers')}
          className={`${tabBase} ${subTab === 'customers' ? tabActive : tabIdle}`}
        >
          <Users className="w-4 h-4" /> Clientes
        </button>
        <button
          onClick={() => setSubTab('collaborators')}
          className={`${tabBase} ${subTab === 'collaborators' ? tabActive : tabIdle}`}
        >
          <UserCheck className="w-4 h-4" /> Colaboradores
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center h-full text-slate-500 text-sm gap-3">
            <div className="w-8 h-8 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
            Carregando...
          </div>
        }>
          {subTab === 'customers' && (
            <ContactList
              contacts={contacts}
              role="customer"
              onUpsert={onUpsert}
              onDelete={onDelete}
              userId={userId}
            />
          )}
          {subTab === 'collaborators' && (
            <ContactList
              contacts={contacts}
              role="collaborator"
              onUpsert={onUpsert}
              onDelete={onDelete}
              userId={userId}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default ContactsDashboard;
