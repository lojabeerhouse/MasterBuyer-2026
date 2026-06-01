import { Contact, ContactRole } from '../../types';

export function filterContactsByRole(contacts: Contact[], role: ContactRole): Contact[] {
  return contacts.filter(c => c.role === role);
}

export function filterActiveCustomers(contacts: Contact[]): Contact[] {
  return contacts
    .filter(c => c.role === 'customer' && c.isEnabled)
    .sort((a, b) => {
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function searchContacts(contacts: Contact[], query: string): Contact[] {
  if (!query.trim()) return contacts;
  const tokens = normalize(query).trim().split(/\s+/).filter(t => t);
  return contacts.filter(c => {
    const n = normalize(c.name);
    return tokens.every(t => n.includes(t));
  });
}
