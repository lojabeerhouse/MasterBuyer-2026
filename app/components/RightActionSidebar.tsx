import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSidebar } from '../contexts/RightSidebarContext';

// ─── Component ────────────────────────────────────────────────────────────────

const RightActionSidebar: React.FC = () => {
  const { isOpen, content, isCollapsed, setCollapsed, badgeCount } = useSidebar();

  if (!isOpen) return null;

  const hasBadge = isCollapsed && badgeCount > 0;

  return (
    <>
      {/* Spacer estático que reserva a largura no layout — impede salto de conteúdo */}
      <div
        className={`shrink-0 h-screen transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-72'}`}
        aria-hidden
      />

      {/* Sidebar flutuante — fixed para ficar acima do backdrop do modal */}
      <aside
        className={`
          fixed right-0 top-0 h-screen z-[150]
          flex flex-col border-l overflow-hidden
          bg-slate-950 border-slate-700/70
          shadow-[-8px_0_32px_rgba(0,0,0,0.6)]
          transition-all duration-300
          ${isCollapsed ? 'w-12' : 'w-72 animate-in slide-in-from-right'}
        `}
        aria-hidden={false}
      >
        {/* Botão de toggle */}
        <div className={`shrink-0 flex ${isCollapsed ? 'justify-center' : 'justify-start'} p-2 border-b border-slate-800/60`}>
          <button
            onClick={() => setCollapsed(!isCollapsed)}
            className="relative p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
            title={isCollapsed ? 'Expandir painel de ações' : 'Recolher painel de ações'}
          >
            {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {hasBadge && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.7)] animate-pulse" />
            )}
          </button>
        </div>

        {/* Conteúdo — QuoteActionsPanel lê isCollapsed do context e se adapta */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          {content}
        </div>
      </aside>
    </>
  );
};

export default RightActionSidebar;
