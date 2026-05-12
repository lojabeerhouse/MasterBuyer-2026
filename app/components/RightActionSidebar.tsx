import React from 'react';
import { useSidebar } from '../contexts/RightSidebarContext';

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * RightActionSidebar
 *
 * Barra lateral persistente no lado direito do layout principal.
 * Seu conteúdo é gerenciado pelo RightSidebarContext — qualquer componente
 * pode "injetar" conteúdo aqui via useSidebar().setSidebarContent(node).
 * Quando vazia (isOpen === false), a barra é recolhida automaticamente.
 */
const RightActionSidebar: React.FC = () => {
  const { isOpen, content } = useSidebar();

  if (!isOpen) return null;

  return (
    <>
      {/* Spacer estático que reserva a largura no layout — impede salto de conteúdo */}
      <div className="w-72 shrink-0 h-screen" aria-hidden />

      {/* Sidebar flutuante — fixed para ficar acima do backdrop do modal */}
      <aside
        className="
          fixed right-0 top-0 h-screen w-72 z-[150]
          flex flex-col border-l overflow-hidden
          bg-slate-950 border-slate-700/70
          shadow-[-8px_0_32px_rgba(0,0,0,0.6)]
          animate-in slide-in-from-right duration-300
        "
        aria-hidden={false}
      >
        <div className="flex flex-col h-full overflow-y-auto">
          {content}
        </div>
      </aside>
    </>
  );
};

export default RightActionSidebar;
