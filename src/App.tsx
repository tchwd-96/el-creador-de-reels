import {useCallback, useEffect, useMemo, useState} from 'react';
import {AlertCircle, X} from 'lucide-react';
import {TopBar} from './components/TopBar';
import {PieceQueuePanel} from './components/PieceQueuePanel';
import {LivePreviewStage} from './components/LivePreviewStage';
import {InspectorPanel} from './components/InspectorPanel';
import {RenderExportPanel} from './components/RenderExportPanel';
import {VideoPreviewModal} from './components/VideoPreviewModal';
import {
  AspectRatio,
  BackgroundMusicConfig,
  GlobalStyleConfig,
  HealthStatus,
  JewelryPiece,
  LogoConfig,
  LogoCorner,
  RenderItemState,
  RenderJobState,
} from './types';

const MAX_PIECES = 10;

const SAMPLE_COLLECTION = [
  {
    sampleFilename: 'sample_ring_diamond_1795021466171.jpg',
    name: 'Solitario Eternidad 18k',
    scriptText:
      'Oro amarillo de 18 quilates\nDiamante central de talla brillante\nLuz eterna en cada faceta',
  },
  {
    sampleFilename: 'sample_necklace_emerald_1795021467188.jpg',
    name: 'Colgante Esmeralda Real',
    scriptText:
      'Esmeralda natural de verde profundo\nOrla de diamantes en pavé artesanal\nElegancia pensada para destacar',
  },
  {
    sampleFilename: 'sample_earrings_gold_1795021466814.jpg',
    name: 'Pendientes Perla Barroca',
    scriptText:
      'Oro cepillado a mano en nuestro taller\nPerlas barrocas de selección única\nMovimiento sutil y atemporal',
  },
];

function stripFileExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

export default function App() {
  const [health, setHealth] = useState<HealthStatus>({
    ok: true,
    ffmpegReady: true,
    geminiConfigured: false,
    gcsEnabled: false,
    gcsBucket: null,
  });

  const [pieces, setPieces] = useState<JewelryPiece[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeBlockIndex, setActiveBlockIndex] = useState(0);

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [styleConfig, setStyleConfig] = useState<GlobalStyleConfig>({
    fontPreset: 'serif',
    fontSize: 46,
    textColor: '#F5F2EB',
    boxColor: '#0A0A0C',
    boxOpacity: 68,
    textPosition: 'bottom',
  });

  const [logoConfig, setLogoConfig] = useState<LogoConfig>({
    fileId: null,
    filename: null,
    previewUrl: null,
    corner: 'top-right',
  });

  const [musicConfig, setMusicConfig] = useState<BackgroundMusicConfig>({
    fileId: null,
    filename: null,
    durationSec: null,
    volume: 28,
  });

  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingSamples, setIsLoadingSamples] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [renderJob, setRenderJob] = useState<RenderJobState | null>(null);
  const [modalItem, setModalItem] = useState<RenderItemState | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) {
          setHealth(data);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const selectedPiece = useMemo(
    () => pieces.find((p) => p.id === selectedId) || pieces[0] || null,
    [pieces, selectedId],
  );

  const renderItemsMap = useMemo(() => {
    const map: Record<string, RenderItemState> = {};
    if (renderJob) {
      for (const item of renderJob.items) {
        map[item.id] = item;
      }
    }
    return map;
  }, [renderJob]);

  const isRendering =
    renderJob?.overallStatus === 'queued' ||
    renderJob?.overallStatus === 'rendering';

  // Poll active render job progress every 800ms
  useEffect(() => {
    if (!renderJob || !isRendering) return;

    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${renderJob.jobId}`);
        if (!res.ok) return;
        const nextJob: RenderJobState = await res.json();
        setRenderJob(nextJob);
      } catch {
        // Keep polling on transient error
      }
    }, 800);

    return () => window.clearInterval(timer);
  }, [renderJob?.jobId, isRendering]);

  const uploadSingleAsset = async (
    file: File,
    kind: 'media' | 'voiceover' | 'music' | 'logo',
  ) => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail || 'No se pudo subir el archivo.');
    }
    return data as {
      fileId: string;
      filename: string;
      mediaType: 'image' | 'video' | 'audio';
      durationSec: number | null;
      previewUrl: string;
    };
  };

  const handleUploadMediaBatch = async (fileList: FileList | File[]) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    const availableSlots = MAX_PIECES - pieces.length;
    if (availableSlots <= 0) {
      setBannerError(
        `Ya alcanzaste el límite de ${MAX_PIECES} piezas por lote.`,
      );
      return;
    }

    const toProcess = incoming.slice(0, availableSlots);
    if (incoming.length > availableSlots) {
      setBannerError(
        `Solo se añadieron ${availableSlots} archivos para respetar el máximo de ${MAX_PIECES} piezas.`,
      );
    } else {
      setBannerError(null);
    }

    setIsUploading(true);
    try {
      const uploadedPieces: JewelryPiece[] = [];
      for (const file of toProcess) {
        const meta = await uploadSingleAsset(file, 'media');
        if (meta.mediaType !== 'image' && meta.mediaType !== 'video') continue;
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        uploadedPieces.push({
          id,
          name: stripFileExtension(meta.filename) || 'Pieza de joyería',
          mediaFileId: meta.fileId,
          mediaType: meta.mediaType,
          filename: meta.filename,
          previewUrl: meta.previewUrl,
          mediaDurationSec: meta.durationSec,
          scriptText: '',
          voiceoverFileId: null,
          voiceoverFilename: null,
          voiceoverDurationSec: null,
          durationMode: 'auto',
          manualSeconds: meta.durationSec ? Math.max(4, Math.round(meta.durationSec)) : 8,
        });
      }

      if (uploadedPieces.length > 0) {
        setPieces((prev) => [...prev, ...uploadedPieces]);
        setSelectedId((prev) => prev || uploadedPieces[0].id);
        setActiveBlockIndex(0);
      }
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Error al subir los archivos.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadSamples = async () => {
    const availableSlots = MAX_PIECES - pieces.length;
    if (availableSlots <= 0) return;

    setBannerError(null);
    setIsLoadingSamples(true);
    try {
      const samplesToAdd = SAMPLE_COLLECTION.slice(0, availableSlots);
      const created: JewelryPiece[] = [];

      for (const sample of samplesToAdd) {
        const res = await fetch('/api/import-sample', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({sampleFilename: sample.sampleFilename}),
        });
        const meta = await res.json();
        if (!res.ok) {
          throw new Error(meta.detail || 'No se pudo cargar la colección de ejemplo.');
        }
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        created.push({
          id,
          name: sample.name,
          mediaFileId: meta.fileId,
          mediaType: 'image',
          filename: meta.filename,
          previewUrl: meta.previewUrl,
          mediaDurationSec: null,
          scriptText: sample.scriptText,
          voiceoverFileId: null,
          voiceoverFilename: null,
          voiceoverDurationSec: null,
          durationMode: 'auto',
          manualSeconds: 8,
        });
      }

      if (created.length > 0) {
        setPieces((prev) => [...prev, ...created]);
        setSelectedId((prev) => prev || created[0].id);
        setActiveBlockIndex(0);
      }
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Error al cargar los ejemplos.',
      );
    } finally {
      setIsLoadingSamples(false);
    }
  };

  const handleUpdatePiece = useCallback(
    (id: string, patch: Partial<JewelryPiece>) => {
      setPieces((prev) =>
        prev.map((p) => (p.id === id ? {...p, ...patch} : p)),
      );
    },
    [],
  );

  const handleRemovePiece = (id: string) => {
    setPieces((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id || null);
      }
      return next;
    });
  };

  const handleMovePiece = (id: string, direction: 'up' | 'down') => {
    setPieces((prev) => {
      const index = prev.findIndex((p) => p.id === id);
      if (index < 0) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  };

  const handleEnhanceWithGemini = async (id: string) => {
    const target = pieces.find((p) => p.id === id);
    if (!target) return;

    handleUpdatePiece(id, {isEnhancing: true, enhanceError: null});
    try {
      const res = await fetch('/api/gemini/enhance', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          pieceName: target.name,
          draftScript: target.scriptText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'No se pudo mejorar el guion con Gemini.');
      }
      handleUpdatePiece(id, {
        scriptText: data.enhancedScript,
        isEnhancing: false,
        enhanceError: null,
      });
      setActiveBlockIndex(0);
    } catch (err) {
      handleUpdatePiece(id, {
        isEnhancing: false,
        enhanceError:
          err instanceof Error
            ? err.message
            : 'Error inesperado al consultar Gemini.',
      });
    }
  };

  const handleUploadVoiceover = async (pieceId: string, file: File) => {
    setBannerError(null);
    try {
      const meta = await uploadSingleAsset(file, 'voiceover');
      handleUpdatePiece(pieceId, {
        voiceoverFileId: meta.fileId,
        voiceoverFilename: meta.filename,
        voiceoverDurationSec: meta.durationSec,
      });
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Error al subir la locución.',
      );
    }
  };

  const handleUploadLogo = async (file: File) => {
    setBannerError(null);
    try {
      const meta = await uploadSingleAsset(file, 'logo');
      setLogoConfig((prev) => ({
        ...prev,
        fileId: meta.fileId,
        filename: meta.filename,
        previewUrl: meta.previewUrl,
      }));
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Error al subir el logotipo.',
      );
    }
  };

  const handleUploadMusic = async (file: File) => {
    setBannerError(null);
    try {
      const meta = await uploadSingleAsset(file, 'music');
      setMusicConfig((prev) => ({
        ...prev,
        fileId: meta.fileId,
        filename: meta.filename,
        durationSec: meta.durationSec,
      }));
    } catch (err) {
      setBannerError(
        err instanceof Error ? err.message : 'Error al subir la música de fondo.',
      );
    }
  };

  const handleStartRender = async () => {
    if (pieces.length === 0 || isRendering) return;
    setBannerError(null);

    try {
      const payload = {
        aspectRatio,
        style: styleConfig,
        logo: {
          fileId: logoConfig.fileId,
          corner: logoConfig.corner,
        },
        backgroundMusic: {
          fileId: musicConfig.fileId,
          volume: musicConfig.volume,
        },
        items: pieces.map((p) => ({
          id: p.id,
          name: p.name || 'Pieza de joyería',
          mediaFileId: p.mediaFileId,
          scriptText: p.scriptText,
          voiceoverFileId: p.voiceoverFileId,
          durationMode: p.durationMode,
          manualSeconds: p.manualSeconds,
        })),
      };

      const res = await fetch('/api/render', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'No se pudo iniciar el renderizado.');
      }

      const initialRes = await fetch(`/api/jobs/${data.jobId}`);
      if (initialRes.ok) {
        const jobState: RenderJobState = await initialRes.json();
        setRenderJob(jobState);
      }

      document
        .getElementById('exportacion-lote')
        ?.scrollIntoView({behavior: 'smooth', block: 'start'});
    } catch (err) {
      setBannerError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error al iniciar el renderizado por lotes.',
      );
    }
  };

  const handleJumpToSection = (sectionId: string) => {
    document
      .getElementById(sectionId)
      ?.scrollIntoView({behavior: 'smooth', block: 'start'});
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F2EB]">
      <TopBar
        pieceCount={pieces.length}
        isRendering={Boolean(isRendering)}
        onStartRender={handleStartRender}
        onJumpToSection={handleJumpToSection}
      />

      <main className="mx-auto flex max-w-[1480px] flex-col gap-6 px-6 py-6">
        {/* Subtle studio intro */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.06] pb-5">
          <div>
            <h1 className="font-editorial text-2xl sm:text-3xl font-semibold tracking-tight text-[#F5F2EB]">
              Producción editorial de joyería por lotes
            </h1>
            <p className="mt-1 text-sm text-[#9E998E]">
              Sube hasta 10 piezas, ajusta el formato y el estilo global, redacta guiones por bloques y exporta en .mp4 o .zip sin inicio de sesión.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-[#9E998E]">
            <span>Formato global: {aspectRatio}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">{pieces.length}/10 piezas</span>
          </div>
        </div>

        {bannerError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 rounded-lg border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{bannerError}</span>
            </div>
            <button
              type="button"
              onClick={() => setBannerError(null)}
              aria-label="Cerrar alerta"
              className="rounded p-1 text-red-300 hover:bg-red-500/20 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* 3-Column Studio Workspace */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <div className="lg:col-span-3">
            <PieceQueuePanel
              pieces={pieces}
              selectedId={selectedPiece?.id || null}
              maxItems={MAX_PIECES}
              isUploading={isUploading}
              isLoadingSamples={isLoadingSamples}
              renderItemsMap={renderItemsMap}
              onSelectPiece={(id) => {
                setSelectedId(id);
                setActiveBlockIndex(0);
              }}
              onUploadFiles={handleUploadMediaBatch}
              onLoadSamples={handleLoadSamples}
              onRemovePiece={handleRemovePiece}
              onMovePiece={handleMovePiece}
            />
          </div>

          <div className="lg:col-span-5">
            <LivePreviewStage
              aspectRatio={aspectRatio}
              onChangeAspectRatio={setAspectRatio}
              piece={selectedPiece}
              styleConfig={styleConfig}
              logoConfig={logoConfig}
              activeBlockIndex={activeBlockIndex}
              onSelectBlockIndex={setActiveBlockIndex}
            />
          </div>

          <div className="lg:col-span-4">
            <InspectorPanel
              piece={selectedPiece}
              styleConfig={styleConfig}
              logoConfig={logoConfig}
              musicConfig={musicConfig}
              geminiConfigured={health.geminiConfigured}
              onUpdatePiece={handleUpdatePiece}
              onEnhanceWithGemini={handleEnhanceWithGemini}
              onUploadVoiceover={handleUploadVoiceover}
              onUpdateStyle={(patch) =>
                setStyleConfig((prev) => ({...prev, ...patch}))
              }
              onUploadLogo={handleUploadLogo}
              onUpdateLogoCorner={(corner: LogoCorner) =>
                setLogoConfig((prev) => ({...prev, corner}))
              }
              onRemoveLogo={() =>
                setLogoConfig((prev) => ({
                  ...prev,
                  fileId: null,
                  filename: null,
                  previewUrl: null,
                }))
              }
              onUploadMusic={handleUploadMusic}
              onUpdateMusicVolume={(volume) =>
                setMusicConfig((prev) => ({...prev, volume}))
              }
              onRemoveMusic={() =>
                setMusicConfig((prev) => ({
                  ...prev,
                  fileId: null,
                  filename: null,
                  durationSec: null,
                }))
              }
              activeBlockIndex={activeBlockIndex}
              onSelectBlockIndex={setActiveBlockIndex}
            />
          </div>
        </div>

        {/* Batch Render & Export Section */}
        <RenderExportPanel
          job={renderJob}
          gcsConfigured={health.gcsEnabled}
          gcsBucket={health.gcsBucket}
          onOpenPreview={(item) => setModalItem(item)}
        />
      </main>

      <VideoPreviewModal
        item={modalItem}
        aspectRatio={renderJob?.aspectRatio || aspectRatio}
        onClose={() => setModalItem(null)}
      />
    </div>
  );
}
