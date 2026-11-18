import React, {useMemo, useRef, useState} from 'react';
import {
  Loader2,
  Mic,
  Music,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  BackgroundMusicConfig,
  FontPreset,
  GlobalStyleConfig,
  JewelryPiece,
  LogoConfig,
  LogoCorner,
  TextPosition,
} from '../types';
import {
  computeEffectiveDuration,
  splitScriptIntoBlocks,
} from '../utils/scriptBlocks';

interface InspectorPanelProps {
  piece: JewelryPiece | null;
  styleConfig: GlobalStyleConfig;
  logoConfig: LogoConfig;
  musicConfig: BackgroundMusicConfig;
  geminiConfigured: boolean;
  onUpdatePiece: (id: string, patch: Partial<JewelryPiece>) => void;
  onEnhanceWithGemini: (id: string) => void;
  onUploadVoiceover: (pieceId: string, file: File) => Promise<void>;
  onUpdateStyle: (patch: Partial<GlobalStyleConfig>) => void;
  onUploadLogo: (file: File) => Promise<void>;
  onUpdateLogoCorner: (corner: LogoCorner) => void;
  onRemoveLogo: () => void;
  onUploadMusic: (file: File) => Promise<void>;
  onUpdateMusicVolume: (volume: number) => void;
  onRemoveMusic: () => void;
  activeBlockIndex: number;
  onSelectBlockIndex: (idx: number) => void;
}

const TEXT_SWATCHES = [
  {label: 'Marfil', hex: '#F5F2EB'},
  {label: 'Oro Champán', hex: '#D4AF37'},
  {label: 'Blanco Puro', hex: '#FFFFFF'},
  {label: 'Ónix', hex: '#0A0A0C'},
];

const BOX_SWATCHES = [
  {label: 'Ónix', hex: '#0A0A0C'},
  {label: 'Carbón', hex: '#1A1A20'},
  {label: 'Marfil', hex: '#F5F2EB'},
  {label: 'Champán', hex: '#524214'},
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  piece,
  styleConfig,
  logoConfig,
  musicConfig,
  geminiConfigured,
  onUpdatePiece,
  onEnhanceWithGemini,
  onUploadVoiceover,
  onUpdateStyle,
  onUploadLogo,
  onUpdateLogoCorner,
  onRemoveLogo,
  onUploadMusic,
  onUpdateMusicVolume,
  onRemoveMusic,
  activeBlockIndex,
  onSelectBlockIndex,
}) => {
  const [activeTab, setActiveTab] = useState<'piece' | 'global'>('piece');
  const [uploadingVo, setUploadingVo] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);

  const voInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  const effectiveDuration = useMemo(() => {
    if (!piece) return 0;
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

  return (
    <section
      id="panel-estilo"
      className="flex flex-col rounded-xl border border-white/[0.08] bg-[#131317] p-5"
    >
      {/* Tab switcher */}
      <div
        className="mb-5 grid grid-cols-2 rounded-lg bg-[#0A0A0C] p-1 border border-white/[0.06]"
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'piece'}
          onClick={() => setActiveTab('piece')}
          className={`rounded-md py-2 text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap ${
            activeTab === 'piece'
              ? 'bg-[#1A1A20] text-[#D4AF37] shadow-sm'
              : 'text-[#9E998E] hover:text-[#F5F2EB]'
          }`}
        >
          Pieza actual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'global'}
          onClick={() => setActiveTab('global')}
          className={`rounded-md py-2 text-xs font-semibold transition-colors duration-150 cursor-pointer whitespace-nowrap ${
            activeTab === 'global'
              ? 'bg-[#1A1A20] text-[#D4AF37] shadow-sm'
              : 'text-[#9E998E] hover:text-[#F5F2EB]'
          }`}
        >
          Estilo y audio global
        </button>
      </div>

      {activeTab === 'piece' ? (
        !piece ? (
          <div className="py-12 text-center">
            <p className="text-sm text-[#9E998E]">
              Selecciona una pieza de la cola para editar su nombre, guion, locución y duración.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Piece Name */}
            <div>
              <label
                htmlFor="piece-name-input"
                className="mb-1.5 block text-xs font-medium text-[#9E998E]"
              >
                Nombre de la pieza
              </label>
              <input
                id="piece-name-input"
                type="text"
                value={piece.name}
                onChange={(e) => onUpdatePiece(piece.id, {name: e.target.value})}
                placeholder="Ej. Solitario de Diamante 18k"
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2 text-sm text-[#F5F2EB] placeholder:text-[#9E998E]/50 focus:border-[#D4AF37] focus:outline-none"
              />
            </div>

            {/* Script + Gemini button */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor="piece-script-input"
                  className="text-xs font-medium text-[#9E998E]"
                >
                  Guion en pantalla (una frase por línea)
                </label>
                <button
                  type="button"
                  onClick={() => onEnhanceWithGemini(piece.id)}
                  disabled={piece.isEnhancing}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#D4AF37]/45 bg-[#D4AF37]/10 px-2.5 py-1 text-xs font-medium text-[#D4AF37] hover:bg-[#D4AF37]/20 disabled:opacity-50 transition-colors duration-150 cursor-pointer whitespace-nowrap shrink-0"
                >
                  {piece.isEnhancing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Mejorando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Mejorar con Gemini</span>
                    </>
                  )}
                </button>
              </div>

              <textarea
                id="piece-script-input"
                rows={4}
                value={piece.scriptText}
                onChange={(e) =>
                  onUpdatePiece(piece.id, {
                    scriptText: e.target.value,
                    enhanceError: null,
                  })
                }
                placeholder={'Oro amarillo de 18 quilates\nCorte brillante certificado\nHecho para perdurar'}
                className="w-full rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2 text-sm leading-relaxed text-[#F5F2EB] placeholder:text-[#9E998E]/45 focus:border-[#D4AF37] focus:outline-none"
              />

              {!geminiConfigured && (
                <p className="mt-1.5 text-[11px] text-[#9E998E]">
                  Nota: Configura <span className="font-mono-tabular">GEMINI_API_KEY</span> o Vertex AI en el entorno para habilitar «Mejorar con Gemini».
                </p>
              )}

              {piece.enhanceError && (
                <p className="mt-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
                  {piece.enhanceError}
                </p>
              )}
            </div>

            {/* Automatic Timed Blocks */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-[#9E998E]">
                <span className="font-medium">Bloques cronometrados</span>
                <span className="font-mono-tabular">{blocks.length} bloques</span>
              </div>
              {blocks.length === 0 ? (
                <p className="rounded-lg border border-white/[0.06] bg-[#0A0A0C]/60 px-3 py-2.5 text-xs text-[#9E998E]">
                  Escribe líneas en el guion para dividirlas automáticamente en bloques cronometrados.
                </p>
              ) : (
                <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
                  {blocks.map((blk, i) => (
                    <button
                      key={blk.index}
                      type="button"
                      onClick={() => onSelectBlockIndex(i)}
                      className={`flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors duration-150 cursor-pointer ${
                        i === activeBlockIndex
                          ? 'border-[#D4AF37]/60 bg-[#1A1A20] text-[#F5F2EB]'
                          : 'border-white/[0.06] bg-[#0A0A0C]/60 text-[#9E998E] hover:text-[#F5F2EB]'
                      }`}
                    >
                      <span className="line-clamp-2 flex-1">{blk.text}</span>
                      <span className="font-mono-tabular shrink-0 text-[11px] text-[#D4AF37]">
                        {blk.startSec.toFixed(1)}–{blk.endSec.toFixed(1)}s
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Voiceover per piece */}
            <div className="border-t border-white/[0.06] pt-4">
              <label className="mb-1.5 block text-xs font-medium text-[#9E998E]">
                Locución / audio personalizado (opcional)
              </label>
              <input
                ref={voInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingVo(true);
                  try {
                    await onUploadVoiceover(piece.id, file);
                  } finally {
                    setUploadingVo(false);
                    e.target.value = '';
                  }
                }}
                className="hidden"
              />

              {piece.voiceoverFileId ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Mic className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-[#F5F2EB]">
                        {piece.voiceoverFilename}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-[#9E998E]">
                        Duración: {(piece.voiceoverDurationSec || 0).toFixed(1)} s
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdatePiece(piece.id, {
                        voiceoverFileId: null,
                        voiceoverFilename: null,
                        voiceoverDurationSec: null,
                      })
                    }
                    className="rounded p-1 text-[#9E998E] hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                    title="Quitar locución"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => voInputRef.current?.click()}
                  disabled={uploadingVo}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2 text-xs font-medium text-[#F5F2EB] hover:border-[#D4AF37]/50 disabled:opacity-50 cursor-pointer"
                >
                  {uploadingVo ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4AF37]" />
                      <span>Subiendo audio...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3.5 w-3.5 text-[#D4AF37]" />
                      <span>Subir locución (.mp3, .wav, .m4a)</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Duration mode */}
            <div className="border-t border-white/[0.06] pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-[#9E998E]">
                  Duración del video
                </span>
                <span className="font-mono-tabular text-xs font-medium text-[#D4AF37]">
                  Total: {effectiveDuration.toFixed(1)} s
                </span>
              </div>

              <div className="grid grid-cols-2 rounded-lg bg-[#0A0A0C] p-1 border border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => onUpdatePiece(piece.id, {durationMode: 'auto'})}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                    piece.durationMode === 'auto'
                      ? 'bg-[#1A1A20] text-[#F5F2EB]'
                      : 'text-[#9E998E] hover:text-[#F5F2EB]'
                  }`}
                >
                  Automática
                </button>
                <button
                  type="button"
                  onClick={() => onUpdatePiece(piece.id, {durationMode: 'manual'})}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                    piece.durationMode === 'manual'
                      ? 'bg-[#1A1A20] text-[#F5F2EB]'
                      : 'text-[#9E998E] hover:text-[#F5F2EB]'
                  }`}
                >
                  Manual (seg)
                </button>
              </div>

              {piece.durationMode === 'manual' ? (
                <div className="mt-2.5 flex items-center gap-3">
                  <input
                    type="number"
                    min={2}
                    max={120}
                    step={0.5}
                    value={piece.manualSeconds}
                    onChange={(e) =>
                      onUpdatePiece(piece.id, {
                        manualSeconds: Math.max(2, Math.min(120, Number(e.target.value) || 8)),
                      })
                    }
                    className="font-mono-tabular w-24 rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-1.5 text-sm text-[#F5F2EB] focus:border-[#D4AF37] focus:outline-none"
                  />
                  <span className="text-xs text-[#9E998E]">
                    segundos (entre 2 y 120 s)
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-[#9E998E]">
                  Calculada automáticamente según la duración de la locución o la extensión del guion.
                </p>
              )}
            </div>
          </div>
        )
      ) : (
        /* Global Style & Audio Tab */
        <div className="flex flex-col gap-5">
          {/* Typography Preset */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-[#9E998E]">
              Tipografía de joyería
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  {id: 'serif', label: 'Serif', cls: 'font-editorial'},
                  {id: 'sans', label: 'Sans', cls: 'font-sans-ui'},
                  {id: 'condensed', label: 'Condensed', cls: 'font-condensed-ui'},
                ] as {id: FontPreset; label: string; cls: string}[]
              ).map((preset) => {
                const active = styleConfig.fontPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onUpdateStyle({fontPreset: preset.id})}
                    className={`rounded-lg border py-2 text-sm transition-colors duration-150 cursor-pointer ${preset.cls} ${
                      active
                        ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5F2EB]'
                        : 'border-white/[0.08] bg-[#0A0A0C] text-[#9E998E] hover:text-[#F5F2EB]'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-[#9E998E]">Tamaño de texto</span>
              <span className="font-mono-tabular text-[#F5F2EB]">
                {styleConfig.fontSize} px
              </span>
            </div>
            <input
              type="range"
              min={24}
              max={84}
              step={2}
              value={styleConfig.fontSize}
              onChange={(e) => onUpdateStyle({fontSize: Number(e.target.value)})}
              className="w-full cursor-pointer"
            />
          </div>

          {/* Text Color */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-[#9E998E]">
              Color del texto
            </span>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {TEXT_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={swatch.label}
                    onClick={() => onUpdateStyle({textColor: swatch.hex})}
                    style={{backgroundColor: swatch.hex}}
                    className={`h-7 w-7 rounded-md border cursor-pointer ${
                      styleConfig.textColor.toUpperCase() === swatch.hex
                        ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/40'
                        : 'border-white/20'
                    }`}
                  />
                ))}
              </div>
              <input
                type="color"
                aria-label="Selector de color de texto"
                value={styleConfig.textColor}
                onChange={(e) => onUpdateStyle({textColor: e.target.value})}
                className="h-8 w-12 cursor-pointer rounded border border-white/15 bg-[#0A0A0C] p-0.5"
              />
            </div>
          </div>

          {/* Background Box Color & Opacity */}
          <div className="border-t border-white/[0.06] pt-4">
            <span className="mb-1.5 block text-xs font-medium text-[#9E998E]">
              Caja de fondo del texto
            </span>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                {BOX_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.hex}
                    type="button"
                    title={swatch.label}
                    onClick={() => onUpdateStyle({boxColor: swatch.hex})}
                    style={{backgroundColor: swatch.hex}}
                    className={`h-7 w-7 rounded-md border cursor-pointer ${
                      styleConfig.boxColor.toUpperCase() === swatch.hex
                        ? 'border-[#D4AF37] ring-2 ring-[#D4AF37]/40'
                        : 'border-white/20'
                    }`}
                  />
                ))}
              </div>
              <input
                type="color"
                aria-label="Selector de color de caja"
                value={styleConfig.boxColor}
                onChange={(e) => onUpdateStyle({boxColor: e.target.value})}
                className="h-8 w-12 cursor-pointer rounded border border-white/15 bg-[#0A0A0C] p-0.5"
              />
            </div>

            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[#9E998E]">Opacidad de la caja</span>
              <span className="font-mono-tabular text-[#F5F2EB]">
                {styleConfig.boxOpacity}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={styleConfig.boxOpacity}
              onChange={(e) => onUpdateStyle({boxOpacity: Number(e.target.value)})}
              className="w-full cursor-pointer"
            />
          </div>

          {/* Text Position */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-[#9E998E]">
              Posición del texto
            </span>
            <div className="grid grid-cols-3 rounded-lg bg-[#0A0A0C] p-1 border border-white/[0.06]">
              {(
                [
                  {id: 'top', label: 'Superior'},
                  {id: 'center', label: 'Centro'},
                  {id: 'bottom', label: 'Inferior'},
                ] as {id: TextPosition; label: string}[]
              ).map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => onUpdateStyle({textPosition: pos.id})}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors duration-150 cursor-pointer ${
                    styleConfig.textPosition === pos.id
                      ? 'bg-[#1A1A20] text-[#F5F2EB]'
                      : 'text-[#9E998E] hover:text-[#F5F2EB]'
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Brand Logo */}
          <div className="border-t border-white/[0.06] pt-4">
            <span className="mb-1.5 block text-xs font-medium text-[#9E998E]">
              Logotipo de marca (opcional)
            </span>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/webp,image/jpeg"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingLogo(true);
                try {
                  await onUploadLogo(file);
                } finally {
                  setUploadingLogo(false);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />

            {logoConfig.fileId ? (
              <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  {logoConfig.previewUrl && (
                    <img
                      src={logoConfig.previewUrl}
                      alt="Logo"
                      referrerPolicy="no-referrer"
                      className="h-7 w-7 rounded object-contain bg-white/5 p-0.5"
                    />
                  )}
                  <span className="truncate text-xs text-[#F5F2EB]">
                    {logoConfig.filename}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onRemoveLogo}
                  title="Quitar logotipo"
                  className="rounded p-1 text-[#9E998E] hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="mb-2.5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2 text-xs font-medium text-[#F5F2EB] hover:border-[#D4AF37]/50 disabled:opacity-50 cursor-pointer"
              >
                {uploadingLogo ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4AF37]" />
                    <span>Subiendo logotipo...</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span>Subir logotipo (.png transparente)</span>
                  </>
                )}
              </button>
            )}

            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  {id: 'top-left', label: 'Sup. izquierda'},
                  {id: 'top-right', label: 'Sup. derecha'},
                  {id: 'bottom-left', label: 'Inf. izquierda'},
                  {id: 'bottom-right', label: 'Inf. derecha'},
                ] as {id: LogoCorner; label: string}[]
              ).map((corner) => (
                <button
                  key={corner.id}
                  type="button"
                  onClick={() => onUpdateLogoCorner(corner.id)}
                  className={`rounded-md border py-1.5 text-xs transition-colors duration-150 cursor-pointer ${
                    logoConfig.corner === corner.id
                      ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#F5F2EB]'
                      : 'border-white/[0.08] bg-[#0A0A0C] text-[#9E998E] hover:text-[#F5F2EB]'
                  }`}
                >
                  {corner.label}
                </button>
              ))}
            </div>
          </div>

          {/* Global Background Music */}
          <div className="border-t border-white/[0.06] pt-4">
            <span className="mb-1.5 block text-xs font-medium text-[#9E998E]">
              Música de fondo global (opcional)
            </span>
            <input
              ref={musicInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingMusic(true);
                try {
                  await onUploadMusic(file);
                } finally {
                  setUploadingMusic(false);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />

            {musicConfig.fileId ? (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Music className="h-4 w-4 shrink-0 text-[#D4AF37]" />
                  <span className="truncate text-xs text-[#F5F2EB]">
                    {musicConfig.filename}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onRemoveMusic}
                  title="Quitar música"
                  className="rounded p-1 text-[#9E998E] hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => musicInputRef.current?.click()}
                disabled={uploadingMusic}
                className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#0A0A0C] px-3 py-2 text-xs font-medium text-[#F5F2EB] hover:border-[#D4AF37]/50 disabled:opacity-50 cursor-pointer"
              >
                {uploadingMusic ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D4AF37]" />
                    <span>Subiendo música...</span>
                  </>
                ) : (
                  <>
                    <Music className="h-3.5 w-3.5 text-[#D4AF37]" />
                    <span>Subir música de fondo (.mp3, .wav)</span>
                  </>
                )}
              </button>
            )}

            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-[#9E998E]">Volumen de música</span>
              <span className="font-mono-tabular text-[#F5F2EB]">
                {musicConfig.volume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={2}
              value={musicConfig.volume}
              onChange={(e) => onUpdateMusicVolume(Number(e.target.value))}
              className="w-full cursor-pointer"
            />
          </div>
        </div>
      )}
    </section>
  );
};
