/**
 * Minimal `.vtt`/`.srt` cue parser (PLAN.md §17.1 "Captions toggle with
 * styling", M3 chunk 2). `expo-video` 58's `VideoSourceObject` has no field
 * for an *external* (non-muxed) subtitle file — confirmed by reading
 * `node_modules/expo-video/build/VideoPlayer.types.d.ts`: `SubtitleTrack`
 * only describes tracks the player itself discovered inside the loaded
 * source (muxed HLS `EXT-X-MEDIA` subtitle renditions), and
 * `VideoSourceObject` has no `textTracks`/`subtitles`-shaped property to
 * point it at a standalone file. A real `GET /videos/{id}/captions`
 * `Caption.path` is a plain `.vtt`/`.srt` file served from disk alongside
 * the HLS renditions (same media root, resolved the same way as every
 * other media path via `resolveMediaUrl`) — not muxed into the stream — so
 * there is no built-in loading path here. `VideoPlayer.tsx` instead fetches
 * that file itself and renders the active cue as a plain text overlay,
 * driven by the same `currentTimeS` it already tracks from the player's
 * `timeUpdate` event (no second position-polling loop).
 *
 * Deliberately not a full spec implementation — just the common case this
 * server actually produces: a `WEBVTT` header (or none, for `.srt`),
 * optional cue-identifier/index lines, a `start --> end` timestamp line
 * (hours optional, `.` or `,` as the millisecond separator so both `.vtt`
 * and `.srt` parse with the same regex), one or more text lines, blank-line
 * separated. Cue settings after the timestamp (`align:`, `position:`, …)
 * and inline tags (`<i>`, `<b>`, `<c.classname>`, `<v Speaker>`) are
 * stripped rather than honoured — this renders plain styled text, not a
 * positioned/formatted one, same simplification the task brief allows.
 */

export interface CaptionCue {
  startS: number;
  endS: number;
  text: string;
}

const TIMESTAMP = /^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/;

function parseTimestamp(raw: string): number | null {
  const match = TIMESTAMP.exec(raw.trim());
  if (!match) return null;
  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/** Strips VTT/SRT inline tags (`<i>`, `<b>`, `<c.yellow>`, `<v Speaker>`, …) — rendered as plain text here. */
function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, "");
}

/** Parses a whole `.vtt`/`.srt` file's text into an ordered cue list. Malformed/unrecognized blocks are skipped rather than throwing. */
export function parseCaptionCues(raw: string): CaptionCue[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: CaptionCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim().length > 0);
    const timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex === -1) continue;

    const [startRaw, afterArrow] = lines[timeLineIndex].split("-->");
    const endRaw = (afterArrow ?? "").trim().split(/\s+/)[0];
    const startS = parseTimestamp(startRaw ?? "");
    const endS = parseTimestamp(endRaw ?? "");
    if (startS === null || endS === null || endS <= startS) continue;

    const cueText = stripTags(lines.slice(timeLineIndex + 1).join("\n")).trim();
    if (!cueText) continue;

    cues.push({ startS, endS, text: cueText });
  }

  return cues.sort((a, b) => a.startS - b.startS);
}

/** The cue active at `currentTimeS`, or `null` when none is — a plain linear scan, fine for the cue-list sizes this server produces. */
export function findActiveCueText(cues: readonly CaptionCue[], currentTimeS: number): string | null {
  const cue = cues.find((c) => currentTimeS >= c.startS && currentTimeS < c.endS);
  return cue ? cue.text : null;
}
