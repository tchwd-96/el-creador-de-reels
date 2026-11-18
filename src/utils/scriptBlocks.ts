import {AspectRatio, DurationMode, TimedBlock} from '../types';

export const ASPECT_RATIO_META: Record<
  AspectRatio,
  {label: string; shortLabel: string; width: number; height: number; cssRatio: string}
> = {
  '9:16': {
    label: 'Vertical (9:16)',
    shortLabel: 'Vertical 9:16',
    width: 1080,
    height: 1920,
    cssRatio: '9 / 16',
  },
  '16:9': {
    label: 'Horizontal (16:9)',
    shortLabel: 'Horizontal 16:9',
    width: 1920,
    height: 1080,
    cssRatio: '16 / 9',
  },
  '1:1': {
    label: 'Cuadrado (1:1)',
    shortLabel: 'Cuadrado 1:1',
    width: 1080,
    height: 1080,
    cssRatio: '1 / 1',
  },
};

export function computeEffectiveDuration(
  durationMode: DurationMode,
  manualSeconds: number,
  mediaType: 'image' | 'video',
  mediaDurationSec: number | null,
  voiceoverDurationSec: number | null,
  scriptText: string,
): number {
  if (durationMode === 'manual') {
    const val = Number.isFinite(manualSeconds) ? manualSeconds : 8;
    return Math.max(2, Math.min(120, Number(val.toFixed(1))));
  }

  if (voiceoverDurationSec && voiceoverDurationSec > 0) {
    return Number(Math.max(3, voiceoverDurationSec + 0.6).toFixed(2));
  }

  const trimmed = (scriptText || '').trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const lines = trimmed ? trimmed.split(/\r?\n/).filter((l) => l.trim()).length : 0;
  const scriptDuration = Math.max(5, Math.min(22, words * 0.48 + Math.max(1, lines) * 0.9));

  if (mediaType === 'video' && mediaDurationSec && mediaDurationSec > 0) {
    return Number(
      Math.max(mediaDurationSec, Math.min(22, words > 0 ? scriptDuration : mediaDurationSec)).toFixed(2),
    );
  }

  return Number((words > 0 ? scriptDuration : 6.0).toFixed(2));
}

export function splitScriptIntoBlocks(rawText: string, totalDuration: number): TimedBlock[] {
  const cleaned = (rawText || '').trim();
  if (!cleaned) {
    return [];
  }

  const rawLines = cleaned
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const line of rawLines) {
    if (line.length <= 68) {
      chunks.push(line);
    } else {
      const sentences = line
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const sent of sentences) {
        if (sent.length <= 68) {
          chunks.push(sent);
        } else {
          const words = sent.split(/\s+/);
          const mid = Math.ceil(words.length / 2);
          chunks.push(words.slice(0, mid).join(' '));
          if (words.length > mid) {
            chunks.push(words.slice(mid).join(' '));
          }
        }
      }
    }
  }

  if (chunks.length === 0) {
    return [];
  }

  const totalDur = Math.max(2, totalDuration);
  const weights = chunks.map((c) => Math.max(10, c.length));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  const blocks: TimedBlock[] = [];
  let cursor = 0;

  chunks.forEach((chunk, idx) => {
    const end =
      idx === chunks.length - 1
        ? totalDur
        : Math.min(totalDur, cursor + Math.max(1.2, totalDur * (weights[idx] / totalWeight)));

    blocks.push({
      index: idx,
      text: chunk,
      startSec: Number(cursor.toFixed(2)),
      endSec: Number(end.toFixed(2)),
    });
    cursor = end;
  });

  blocks[blocks.length - 1].endSec = Number(totalDur.toFixed(2));
  return blocks;
}

export function hexToRgbaCss(hex: string, opacityPct: number): string {
  let clean = (hex || '#0A0A0C').trim().replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (clean.length !== 6) {
    clean = '0A0A0C';
  }
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(1, opacityPct / 100));
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}
