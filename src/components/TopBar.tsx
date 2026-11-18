import React from 'react';
import {Film, Loader2} from 'lucide-react';

interface TopBarProps {
  pieceCount: number;
  isRendering: boolean;
  onStartRender: () => void;
  onJumpToSection: (sectionId: string) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  pieceCount,
  isRendering,
  onStartRender,
  onJumpToSection,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0A0A0C]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-8 px-6 py-4">
        <a
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            onJumpToSection('cola-piezas');
          }}
          className="font-editorial text-xl font-semibold tracking-tight text-[#F5F2EB] whitespace-nowrap shrink-0"
        >
          Jewelry Promo Studio
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm text-[#9E998E]">
          <button
            type="button"
            onClick={() => onJumpToSection('cola-piezas')}
            className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cola de piezas
          </button>
          <button
            type="button"
            onClick={() => onJumpToSection('vista-previa')}
            className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Vista previa
          </button>
          <button
            type="button"
            onClick={() => onJumpToSection('panel-estilo')}
            className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Estilo global
          </button>
          <button
            type="button"
            onClick={() => onJumpToSection('exportacion-lote')}
            className="hover:text-[#F5F2EB] transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Exportación
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onStartRender}
            disabled={pieceCount === 0 || isRendering}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-semibold text-[#0A0A0C] hover:bg-[#E5C76B] disabled:opacity-45 disabled:cursor-not-allowed transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isRendering ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Renderizando...</span>
              </>
            ) : (
              <>
                <Film className="h-4 w-4" />
                <span>Generar videos</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
