export type AspectRatio = '9:16' | '16:9' | '1:1';
export type FontPreset = 'serif' | 'sans' | 'condensed';
export type TextPosition = 'top' | 'center' | 'bottom';
export type LogoCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type DurationMode = 'auto' | 'manual';

export interface TimedBlock {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
}

export interface GlobalStyleConfig {
  fontPreset: FontPreset;
  fontSize: number;
  textColor: string;
  boxColor: string;
  boxOpacity: number;
  textPosition: TextPosition;
}

export interface LogoConfig {
  fileId: string | null;
  filename: string | null;
  previewUrl: string | null;
  corner: LogoCorner;
}

export interface BackgroundMusicConfig {
  fileId: string | null;
  filename: string | null;
  durationSec: number | null;
  volume: number;
}

export interface JewelryPiece {
  id: string;
  name: string;
  mediaFileId: string;
  mediaType: 'image' | 'video';
  filename: string;
  previewUrl: string;
  mediaDurationSec: number | null;
  scriptText: string;
  voiceoverFileId: string | null;
  voiceoverFilename: string | null;
  voiceoverDurationSec: number | null;
  durationMode: DurationMode;
  manualSeconds: number;
  isEnhancing?: boolean;
  enhanceError?: string | null;
}

export interface RenderItemState {
  id: string;
  name: string;
  status: 'queued' | 'rendering' | 'completed' | 'error';
  progress: number;
  filename: string | null;
  outputUrl: string | null;
  downloadUrl: string | null;
  gcsUrl: string | null;
  durationSec: number | null;
  errorMessage: string | null;
}

export interface RenderJobState {
  jobId: string;
  overallStatus: 'queued' | 'rendering' | 'completed' | 'completed_with_errors';
  aspectRatio: AspectRatio;
  gcsEnabled: boolean;
  zipUrl: string | null;
  zipGcsUrl: string | null;
  items: RenderItemState[];
}

export interface HealthStatus {
  ok: boolean;
  ffmpegReady: boolean;
  geminiConfigured: boolean;
  gcsEnabled: boolean;
  gcsBucket: string | null;
}
