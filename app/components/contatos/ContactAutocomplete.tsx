import React, { useState, useRef, useEffect } from 'react';
import { User, ChevronDown, X } from 'lucide-react';
import { Contact } from '../../types';
import { filterActiveCustomers, searchContacts } from '../../services/contatos/contactService';

interface ContactAutocompleteProps {
  contacts: Contact[];
  value: string;
  onChange: (name: string) => void;
  className?: string;
}

const ContactAutocomplete: React.FC<ContactAutocompleteProps> = ({ contacts, value, onChange, className }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const activeCustomers = filterActiveCustomers(contacts);
  const results = search ? searchContacts(activeCustomers, search) : activeCustomers;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
    setSearch('');
  };

  const handleOpen = () => {
    setOpen(true);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none z-10" />
      <input
        type="text"
        value={open ? search : value}
        onChange={e => { if (open) setSearch(e.target.value); }}
        onFocus={handleOpen}
        placeholder="Consumidor Final"
        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-7 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
      />
      {open ? (
        <X
          className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-white transition-colors"
          onMouseDown={e => e.preventDefault()}
          onClick={() => { setOpen(false); setSearch(''); }}
        />
      ) : (
        <ChevronDown
          className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 cursor-pointer hover:text-slate-300 transition-colors"
          onClick={handleOpen}
        />
      )}
      {open && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden max-h-48 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">Nenhum cliente encontrado</div>
          ) : (
            results.map(c => (
              <button
                key={c.id}
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(c.name)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 ${c.name === value ? 'text-amber-400 font-bold bg-slate-700/50' : 'text-slate-200'}`}
              >
                {c.name}
                {c.isDefault && <span className="ml-2 text-[10px] text-slate-500">padrão</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default ContactAutocomplete;
