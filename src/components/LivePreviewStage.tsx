import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Gem, Pause, Play, RotateCcw} from 'lucide-react';
import {
  AspectRatio,
  GlobalStyleConfig,
  JewelryPiece,
  LogoConfig,
} from '../types';
import {
  ASPECT_RATIO_META,
  computeEffectiveDuration,
  hexToRgbaCss,
  splitScriptIntoBlocks,
} from '../utils/scriptBlocks';

interface LivePreviewStageProps {
  aspectRatio: AspectRatio;
  onChangeAspectRatio: (ratio: AspectRatio) => void;
  piece: JewelryPiece | null;
  styleConfig: GlobalStyleConfig;
  logoConfig: LogoConfig;
  activeBlockIndex: number;
  onSelectBlockIndex: (idx: number) => void;
}

export const LivePreviewStage: React.FC<LivePreviewStageProps> = ({
  aspectRatio,
  onChangeAspectRatio,
  piece,
  styleConfig,
  logoConfig,
  activeBlockIndex,
  onSelectBlockIndex,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stageSize, setStageSize] = useState<{w: number; h: number}>({w: 360, h: 640});
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);

  const meta = ASPECT_RATIO_META[aspectRatio];

  const effectiveDuration = useMemo(() => {
    if (!piece) return 6;
    return computeEffectiveDuration(
      piece.durationMode,
      piece.manualSeconds,
      piece.mediaType,
      piece.mediaDurationSec,
      piece.voiceoverDurationSec,
      piece.scriptText,
    );
  }, [piece]);

  const blocks = useMemo(() => {
    if (!piece) return [];
    return splitScriptIntoBlocks(piece.scriptText, effectiveDuration);
  }, [piece, effectiveDuration]);

  // Measure rendered preview frame so typography & logo scale identically to Pillow 1080p
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageSize({w: rect.width, h: rect.height});
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aspectRatio]);

  // Reset playback when switching pieces
  useEffect(() => {
    setIsPlayingPreview(false);
    setPlayheadSec(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [piece?.id]);

  // Interactive timed block playback loop
  useEffect(() => {
    if (!isPlayingPreview || !piece) return;

    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }

    const startTime = performance.now() - playheadSec * 1000;
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      if (elapsed >= effectiveDuration) {
        setPlayheadSec(0);
        setIsPlayingPreview(false);
        onSelectBlockIndex(0);
        if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
        }
        return;
      }
      setPlayheadSec(elapsed);
      const foundIdx = blocks.findIndex(
        (b) => elapsed >= b.startSec && elapsed <= b.endSec,
      );
      if (foundIdx >= 0 && foundIdx !== activeBlockIndex) {
        onSelectBlockIndex(foundIdx);
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (videoRef.current) {
        videoRef.current.pause();
      }
    };
  }, [isPlayingPreview, effectiveDuration, blocks, piece?.id]);

  const currentBlock = useMemo(() => {
    if (blocks.length === 0) return null;
    const safeIdx = Math.min(Math.max(0, activeBlockIndex), blocks.length - 1);
    return blocks[safeIdx];
  }, [blocks, activeBlockIndex]);

  // Mirror Pillow scaling: min(W, H) / 1080
  const scaleFactor = Math.min(stageSize.w, stageSize.h) / 1080;
  const scaledFontPx = Math.max(10, styleConfig.fontSize * scaleFactor);
  const padX = scaledFontPx * 0.85;
  const padY = scaledFontPx * 0.55;
  const boxRadius = Math.max(4, scaledFontPx * 0.28);
  const verticalMarginPct = 11;
  const logoMaxPx = Math.max(18, Math.min(stageSize.w, stageSize.h) * 0.15);
  const logoMarginPx = Math.max(8, Math.min(stageSize.w, stageSize.h) * 0.045);

  const fontFamilyClass =
    styleConfig.fontPreset === 'serif'
      ? 'font-editorial font-semibold'
      : styleConfig.fontPreset === 'condensed'
        ? 'font-condensed-ui font-semibold tracking-wide'
        : 'font-sans-ui font-medium';

  const boxBgCss = hexToRgbaCss(styleConfig.boxColor, styleConfig.boxOpacity);

  const handleJumpBlock = (idx: number) => {
    onSelectBlockIndex(idx);
    if (blocks[idx]) {
      setPlayheadSec(blocks[idx].startSec);
      if (videoRef.current) {
        videoRef.current.currentTime = blocks[idx].startSec;
      }
    }
  };

  return (
    <section
      id="vista-previa"
      className="flex flex-col rounded-xl border border-white/[0.08] bg-[#131317] p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-editorial text-lg font-medium text-[#F5F2EB]">
            Vista previa en vivo
          </h2>
          <p className="mt-0.5 text-xs text-[#9E998E]">
            Recorte centrado sin zoom ni movimiento · Aplicado a todo el lote
          </p>
        </div>

        <div
          className="inline-flex items-center rounded-lg bg-[#0A0A0C] p-1 border border-white/[0.06]"
          role="group"
          aria-label="Relación de aspecto global"
        >
          {(['9:16', '16:9', '1:1'] as AspectRatio[]).map((ratio) => {
            const active = aspectRatio === ratio;
            return (
              <button
                key={ratio}
                type="button"
                onClick={() => onChangeAspectRatio(ratio)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#D4AF37] text-[#0A0A0C]'
                    : 'text-[#9E998E] hover:text-[#F5F2EB]'
                }`}
              >
                {ASPECT_RATIO_META[ratio].shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage container */}
      <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-[#0A0A0C] border border-white/[0.06] p-4 sm:p-6 min-h-[440px]">
        <div className="mb-3 flex w-full items-center justify-between text-xs text-[#9E998E]">
          <span className="truncate font-medium text-[#F5F2EB]">
            {piece ? piece.name : 'Sin pieza seleccionada'}
          </span>
          <span className="font-mono-tabular shrink-0">
            {meta.width} × {meta.height} px · 30 fps
          </span>
        </div>

        <div
          className="relative flex items-center justify-center w-full"
          style={{minHeight: '360px'}}
        >
          <div
            ref={stageRef}
            style={{
              aspectRatio: meta.cssRatio,
              width:
                aspectRatio === '9:16'
                  ? 'min(100%, 305px)'
                  : aspectRatio === '1:1'
                    ? 'min(100%, 410px)'
                    : 'min(100%, 580px)',
            }}
            className="relative overflow-hidden rounded-lg bg-[#16161B] border border-white/[0.1] shadow-2xl"
          >
            {!piece ? (
              <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
                <Gem className="mb-3 h-8 w-8 text-[#D4AF37]/70" />
                <p className="font-editorial text-base text-[#F5F2EB]">
                  Estudio listo para producir
                </p>
                <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-[#9E998E]">
                  Arrastra hasta 10 fotos o clips en el panel izquierdo o carga la colección de ejemplo para previsualizar el encuadre.
                </p>
              </div>
            ) : (
              <>
                {/* Exact centered cover crop without motion/zoom */}
                {piece.mediaType === 'image' ? (
                  <img
                    src={piece.previewUrl}
                    alt={piece.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover object-center select-none"
                  />
                ) : (
                  <video
                    ref={videoRef}
                    src={piece.previewUrl}
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover object-center"
                  />
                )}

                {/* Brand Logo Corner Overlay */}
                {logoConfig.previewUrl && (
                  <img
                    src={logoConfig.previewUrl}
                    alt="Logotipo de marca"
                    referrerPolicy="no-referrer"
                    style={{
                      maxWidth: `${logoMaxPx}px`,
                      maxHeight: `${logoMaxPx}px`,
                      top: logoConfig.corner.startsWith('top') ? `${logoMarginPx}px` : undefined,
                      bottom: logoConfig.corner.startsWith('bottom') ? `${logoMarginPx}px` : undefined,
                      left: logoConfig.corner.endsWith('left') ? `${logoMarginPx}px` : undefined,
                      right: logoConfig.corner.endsWith('right') ? `${logoMarginPx}px` : undefined,
                    }}
                    className="pointer-events-none absolute object-contain"
                  />
                )}

                {/* Active Timed Text Block Overlay */}
                {currentBlock && currentBlock.text.trim() && (
                  <div
                    style={{
                      top:
                        styleConfig.textPosition === 'top'
                          ? `${verticalMarginPct}%`
                          : styleConfig.textPosition === 'center'
                            ? '50%'
                            : undefined,
                      bottom:
                        styleConfig.textPosition === 'bottom'
                          ? `${verticalMarginPct}%`
                          : undefined,
                      transform:
                        styleConfig.textPosition === 'center'
                          ? 'translateY(-50%)'
                          : undefined,
                    }}
                    className="pointer-events-none absolute inset-x-0 flex justify-center px-[5%]"
                  >
                    <div
                      style={{
                        backgroundColor: boxBgCss,
                        padding: `${padY}px ${padX}px`,
                        borderRadius: `${boxRadius}px`,
                        color: styleConfig.textColor,
                        fontSize: `${scaledFontPx}px`,
                        lineHeight: 1.3,
                        textShadow:
                          styleConfig.boxOpacity < 30
                            ? '0 1px 4px rgba(0,0,0,0.75)'
                            : undefined,
                      }}
                      className={`max-w-[90%] text-center whitespace-pre-wrap break-words ${fontFamilyClass}`}
                    >
                      {currentBlock.text}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Interactive Block Playback Controls */}
        {piece && (
          <div className="mt-4 w-full border-t border-white/[0.06] pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsPlayingPreview((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#1A1A20] px-3 py-1.5 text-xs font-medium text-[#F5F2EB] hover:border-[#D4AF37]/50 cursor-pointer whitespace-nowrap"
                >
                  {isPlayingPreview ? (
                    <>
                      <Pause className="h-3.5 w-3.5 text-[#D4AF37]" />
                      <span>Pausar bloques</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 text-[#D4AF37]" />
                      <span>Simular bloques</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPlayingPreview(false);
                    handleJumpBlock(0);
                  }}
                  title="Reiniciar vista previa"
                  className="rounded-md border border-white/[0.08] bg-[#131317] p-1.5 text-[#9E998E] hover:text-[#F5F2EB] cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>

              <span className="font-mono-tabular text-xs text-[#9E998E]">
                {playheadSec.toFixed(1)} s / {effectiveDuration.toFixed(1)} s
              </span>
            </div>

            {blocks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {blocks.map((blk, i) => {
                  const isActive = i === activeBlockIndex;
                  return (
                    <button
                      key={blk.index}
                      type="button"
                      onClick={() => {
                        setIsPlayingPreview(false);
                        handleJumpBlock(i);
                      }}
                      className={`rounded-md border px-2.5 py-1 text-left text-xs transition-colors duration-150 cursor-pointer ${
                        isActive
                          ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5F2EB]'
                          : 'border-white/[0.08] bg-[#131317] text-[#9E998E] hover:text-[#F5F2EB]'
                      }`}
                    >
                      <span className="font-mono-tabular mr-1.5 text-[11px] text-[#D4AF37]">
                        B{i + 1}
                      </span>
                      <span className="font-mono-tabular text-[11px]">
                        {blk.startSec.toFixed(1)}–{blk.endSec.toFixed(1)}s
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
