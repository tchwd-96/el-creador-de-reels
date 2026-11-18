import React, {useEffect} from 'react';
import {Download, X} from 'lucide-react';
import {AspectRatio, RenderItemState} from '../types';

interface VideoPreviewModalProps {
  item: RenderItemState | null;
  aspectRatio: AspectRatio;
  onClose: () => void;
}

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  item,
  aspectRatio,
  onClose,
}) => {
  useEffect(() => {
    if (!item) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [item, onClose]);

  if (!item || !item.outputUrl) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Vista previa de ${item.name}`}
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-[#131317] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-editorial truncate text-lg font-medium text-[#F5F2EB]">
              {item.name}
            </h3>
            <p className="font-mono-tabular text-xs text-[#9E998E]">
              {item.filename} · {aspectRatio}
              {item.durationSec ? ` · ${item.durationSec.toFixed(1)} s` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar vista previa"
            className="rounded-lg p-1.5 text-[#9E998E] hover:bg-white/[0.08] hover:text-[#F5F2EB] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex max-h-[70vh] items-center justify-center bg-[#0A0A0C] p-4">
          <video
            src={item.outputUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[64vh] w-auto rounded-lg"
          />
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-white/[0.08] px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.1] px-4 py-2 text-xs font-medium text-[#F5F2EB] hover:bg-white/[0.06] cursor-pointer"
          >
            Cerrar
          </button>
          {item.downloadUrl && (
            <a
              href={item.downloadUrl}
              download={item.filename || undefined}
              className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0A0A0C] hover:bg-[#E5C76B]"
            >
              <Download className="h-4 w-4" />
              <span>Descargar .mp4</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
