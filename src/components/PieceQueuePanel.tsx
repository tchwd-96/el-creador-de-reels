import React, {useRef, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Film,
  Gem,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';
import {JewelryPiece, RenderItemState} from '../types';
import {computeEffectiveDuration} from '../utils/scriptBlocks';

interface PieceQueuePanelProps {
  pieces: JewelryPiece[];
  selectedId: string | null;
  maxItems: number;
  isUploading: boolean;
  isLoadingSamples: boolean;
  renderItemsMap: Record<string, RenderItemState>;
  onSelectPiece: (id: string) => void;
  onUploadFiles: (files: FileList | File[]) => void;
  onLoadSamples: () => void;
  onRemovePiece: (id: string) => void;
  onMovePiece: (id: string, direction: 'up' | 'down') => void;
}

export const PieceQueuePanel: React.FC<PieceQueuePanelProps> = ({
  pieces,
  selectedId,
  maxItems,
  isUploading,
  isLoadingSamples,
  renderItemsMap,
  onSelectPiece,
  onUploadFiles,
  onLoadSamples,
  onRemovePiece,
  onMovePiece,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(e.target.files);
      e.target.value = '';
    }
  };

  const remaining = Math.max(0, maxItems - pieces.length);

  return (
    <section
      id="cola-piezas"
      className="flex flex-col rounded-xl border border-white/[0.08] bg-[#131317] p-5"
    >
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="font-editorial text-lg font-medium text-[#F5F2EB]">
          Cola de piezas
        </h2>
        <span className="font-mono-tabular text-xs text-[#9E998E]">
          {pieces.length} / {maxItems} piezas
        </span>
      </div>

      <p className="mb-4 text-xs text-[#9E998E]">
        1 foto o clip de joyería = 1 video promocional (.mp4)
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => remaining > 0 && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && remaining > 0) {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className={`group flex flex-col items-center justify-center rounded-lg border border-dashed px-4 py-5 text-center transition-colors duration-150 ${
          remaining === 0
            ? 'border-white/[0.06] bg-[#0A0A0C]/40 opacity-50 cursor-not-allowed'
            : isDragging
              ? 'border-[#D4AF37] bg-[#D4AF37]/10 cursor-pointer'
              : 'border-white/15 bg-[#0A0A0C]/60 hover:border-[#D4AF37]/60 hover:bg-[#1A1A20] cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
          onChange={handleFileChange}
          className="hidden"
          disabled={remaining === 0}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <Loader2 className="h-5 w-5 animate-spin text-[#D4AF37]" />
            <span className="text-xs font-medium text-[#F5F2EB]">
              Subiendo archivos...
            </span>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-5 w-5 text-[#D4AF37]" />
            <span className="text-sm font-medium text-[#F5F2EB]">
              {remaining > 0
                ? 'Arrastra fotos o clips aquí'
                : 'Límite de 10 piezas alcanzado'}
            </span>
            <span className="mt-1 text-xs text-[#9E998E]">
              {remaining > 0
                ? `JPG, PNG, WEBP, MP4, MOV · Quedan ${remaining} espacios`
                : 'Elimina una pieza para subir otra'}
            </span>
          </>
        )}
      </div>

      {pieces.length <= 7 && (
        <button
          type="button"
          onClick={onLoadSamples}
          disabled={isLoadingSamples || isUploading}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#1A1A20] px-3 py-2 text-xs font-medium text-[#F5F2EB] hover:border-[#D4AF37]/50 hover:text-[#D4AF37] disabled:opacity-50 transition-colors duration-150 cursor-pointer whitespace-nowrap"
        >
          {isLoadingSamples ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Cargando piezas de ejemplo...</span>
            </>
          ) : (
            <>
              <Gem className="h-3.5 w-3.5 text-[#D4AF37]" />
              <span>Cargar colección de ejemplo (3 piezas)</span>
            </>
          )}
        </button>
      )}

      <div className="mt-5 flex flex-col divide-y divide-white/[0.06]">
        {pieces.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-[#9E998E]">
              Aún no hay piezas en el lote.
            </p>
            <p className="mt-1 text-xs text-[#9E998E]/75">
              Sube tus fotos o clips de joyería para empezar.
            </p>
          </div>
        ) : (
          pieces.map((piece, idx) => {
            const isSelected = piece.id === selectedId;
            const renderState = renderItemsMap[piece.id];
            const duration = computeEffectiveDuration(
              piece.durationMode,
              piece.manualSeconds,
              piece.mediaType,
              piece.mediaDurationSec,
              piece.voiceoverDurationSec,
              piece.scriptText,
            );

            return (
              <div
                key={piece.id}
                onClick={() => onSelectPiece(piece.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPiece(piece.id);
                  }
                }}
                className={`group flex flex-col gap-2 py-3 px-2.5 -mx-2.5 rounded-lg transition-colors duration-150 cursor-pointer ${
                  isSelected
                    ? 'bg-[#1A1A20] ring-1 ring-[#D4AF37]/45'
                    : 'hover:bg-[#1A1A20]/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono-tabular w-5 text-xs text-[#9E998E] shrink-0">
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-[#0A0A0C] border border-white/[0.08] flex items-center justify-center">
                    {piece.mediaType === 'image' ? (
                      <img
                        src={piece.previewUrl}
                        alt={piece.name}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      <video
                        src={piece.previewUrl}
                        muted
                        playsInline
                        className="h-full w-full object-cover object-center"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#F5F2EB]">
                      {piece.name || `Pieza ${idx + 1}`}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#9E998E]">
                      {piece.mediaType === 'image' ? (
                        <ImageIcon className="h-3 w-3 shrink-0" />
                      ) : (
                        <Film className="h-3 w-3 shrink-0" />
                      )}
                      <span>{piece.mediaType === 'image' ? 'Foto' : 'Clip'}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">{duration.toFixed(1)} s</span>
                      {piece.voiceoverFileId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#D4AF37]">Voz</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="Subir en la cola"
                      disabled={idx === 0}
                      onClick={() => onMovePiece(piece.id, 'up')}
                      className="rounded p-1 text-[#9E998E] hover:bg-white/[0.06] hover:text-[#F5F2EB] disabled:opacity-25 cursor-pointer"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Bajar en la cola"
                      disabled={idx === pieces.length - 1}
                      onClick={() => onMovePiece(piece.id, 'down')}
                      className="rounded p-1 text-[#9E998E] hover:bg-white/[0.06] hover:text-[#F5F2EB] disabled:opacity-25 cursor-pointer"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Eliminar pieza"
                      onClick={() => onRemovePiece(piece.id)}
                      className="rounded p-1 text-[#9E998E] hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {renderState && (
                  <div className="pl-8 pr-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span
                        className={
                          renderState.status === 'completed'
                            ? 'text-emerald-400'
                            : renderState.status === 'error'
                              ? 'text-red-400'
                              : renderState.status === 'rendering'
                                ? 'text-[#D4AF37]'
                                : 'text-[#9E998E]'
                        }
                      >
                        {renderState.status === 'queued' && 'En cola'}
                        {renderState.status === 'rendering' && 'Renderizando'}
                        {renderState.status === 'completed' && 'Completado'}
                        {renderState.status === 'error' && 'Error'}
                      </span>
                      <span className="font-mono-tabular text-[#9E998E]">
                        {renderState.progress}%
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full transition-all duration-200 ${
                          renderState.status === 'error'
                            ? 'bg-red-500'
                            : renderState.status === 'completed'
                              ? 'bg-emerald-500'
                              : 'bg-[#D4AF37]'
                        }`}
                        style={{width: `${renderState.progress}%`}}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
