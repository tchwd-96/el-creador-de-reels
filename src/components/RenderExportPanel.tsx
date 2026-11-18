import React from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Cloud,
  Download,
  Loader2,
  Play,
} from 'lucide-react';
import {RenderItemState, RenderJobState} from '../types';

interface RenderExportPanelProps {
  job: RenderJobState | null;
  gcsConfigured: boolean;
  gcsBucket: string | null;
  onOpenPreview: (item: RenderItemState) => void;
}

export const RenderExportPanel: React.FC<RenderExportPanelProps> = ({
  job,
  gcsConfigured,
  gcsBucket,
  onOpenPreview,
}) => {
  if (!job) {
    return (
      <section
        id="exportacion-lote"
        className="rounded-xl border border-white/[0.08] bg-[#131317] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-editorial text-lg font-medium text-[#F5F2EB]">
              Exportación y descargas
            </h2>
            <p className="mt-1 text-xs text-[#9E998E]">
              Cuando pulses «Generar videos», aquí verás el progreso en tiempo real de cada pieza, la vista previa en .mp4 y la descarga individual o en archivo .zip.
            </p>
          </div>
          {gcsConfigured && (
            <div className="flex items-center gap-2 text-xs text-[#9E998E]">
              <Cloud className="h-4 w-4 text-[#D4AF37]" />
              <span>
                Google Cloud Storage activo:{' '}
                <span className="font-mono-tabular text-[#F5F2EB]">{gcsBucket}</span>
              </span>
            </div>
          )}
        </div>
      </section>
    );
  }

  const completedCount = job.items.filter((i) => i.status === 'completed').length;
  const isFinished =
    job.overallStatus === 'completed' ||
    job.overallStatus === 'completed_with_errors';

  return (
    <section
      id="exportacion-lote"
      className="rounded-xl border border-white/[0.08] bg-[#131317] p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] pb-4">
        <div>
          <h2 className="font-editorial text-lg font-medium text-[#F5F2EB]">
            Exportación del lote
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#9E998E]">
            <span>
              {isFinished
                ? `Finalizado: ${completedCount} de ${job.items.length} videos listos`
                : `Procesando lote en segundo plano (${completedCount}/${job.items.length})`}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">Formato {job.aspectRatio}</span>
            {job.gcsEnabled && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-[#D4AF37]">
                  <Cloud className="h-3.5 w-3.5" />
                  <span>Sincronización GCS activa</span>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {job.zipGcsUrl && (
            <a
              href={job.zipGcsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#1A1A20] px-3.5 py-2 text-xs font-medium text-[#F5F2EB] hover:border-[#D4AF37]/50 transition-colors whitespace-nowrap"
            >
              <Cloud className="h-3.5 w-3.5 text-[#D4AF37]" />
              <span>ZIP en Cloud Storage</span>
            </a>
          )}

          {job.zipUrl && (
            <a
              href={job.zipUrl}
              download
              className="inline-flex items-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2 text-xs font-semibold text-[#0A0A0C] hover:bg-[#E5C76B] transition-colors whitespace-nowrap"
            >
              <Archive className="h-4 w-4" />
              <span>Descargar todo (.zip)</span>
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {job.items.map((item, idx) => (
          <div
            key={item.id}
            className="flex flex-col justify-between gap-3 rounded-lg border border-white/[0.08] bg-[#0A0A0C] p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono-tabular text-xs text-[#9E998E]">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <p className="truncate text-sm font-medium text-[#F5F2EB]">
                    {item.name}
                  </p>
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs">
                  {item.status === 'queued' && (
                    <span className="text-[#9E998E]">En cola</span>
                  )}
                  {item.status === 'rendering' && (
                    <span className="inline-flex items-center gap-1.5 text-[#D4AF37]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Renderizando</span>
                    </span>
                  )}
                  {item.status === 'completed' && (
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Completado</span>
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="inline-flex items-center gap-1.5 text-red-400">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Error al renderizar</span>
                    </span>
                  )}

                  {item.durationSec && (
                    <>
                      <span aria-hidden="true" className="text-[#9E998E]">
                        ·
                      </span>
                      <span className="font-mono-tabular text-[#9E998E]">
                        {item.durationSec.toFixed(1)} s
                      </span>
                    </>
                  )}
                </div>
              </div>

              <span className="font-mono-tabular text-xs font-medium text-[#F5F2EB] shrink-0">
                {item.progress}%
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full transition-all duration-200 ${
                  item.status === 'error'
                    ? 'bg-red-500'
                    : item.status === 'completed'
                      ? 'bg-emerald-500'
                      : 'bg-[#D4AF37]'
                }`}
                style={{width: `${item.progress}%`}}
              />
            </div>

            {item.errorMessage && (
              <p className="text-xs text-red-300 break-words">
                {item.errorMessage}
              </p>
            )}

            {item.status === 'completed' && item.outputUrl && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenPreview(item)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-[#1A1A20] px-3 py-1.5 text-xs font-medium text-[#F5F2EB] hover:border-[#D4AF37]/60 cursor-pointer whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span>Ver .mp4</span>
                  </button>

                  {item.downloadUrl && (
                    <a
                      href={item.downloadUrl}
                      download={item.filename || undefined}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3 py-1.5 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/20 whitespace-nowrap"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Descargar</span>
                    </a>
                  )}
                </div>

                {item.gcsUrl && item.gcsUrl.startsWith('http') && (
                  <a
                    href={item.gcsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#9E998E] hover:text-[#D4AF37]"
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span>Ver en GCS</span>
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
