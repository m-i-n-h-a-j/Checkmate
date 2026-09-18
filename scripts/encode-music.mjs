#!/usr/bin/env node
/**
 * Builds the game's music cues from the source recordings.
 *
 *   npm run audio:music -- "D:\Videos\Musics"
 *
 * Each cue is cut to the part of the track the game needs, normalized so cues sit at the same
 * level, downmixed to mono and encoded small: Opus for everyone, HE-AAC for browsers without
 * Ogg/Opus support. The two loops are crossfaded end to start so they repeat without a seam.
 *
 * Outputs to public/audio/. Requires ffmpeg and ffprobe on the PATH.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = process.argv[2] ?? 'D:/Videos/Musics';
const OUT = join(import.meta.dirname, '..', 'public', 'audio');

/**
 * `match` finds the source file, `from`/`to` are the seconds to keep. Loops are crossfaded by
 * `overlap` seconds; stings just fade out at the end.
 */
const CUES = [
  { name: 'win', match: 'victory', from: 0, to: 22, loop: false, target: -16 },
  { name: 'loss', match: 'loss', from: 10, to: 34, loop: false, target: -16 },
  { name: 'tension', match: 'endgame', from: 26, to: 86, loop: true, target: -21 },
  { name: 'time', match: 'time trouble', from: 13, to: 53, loop: true, target: -21 },
];
const OVERLAP = 2;
const FADE_IN = 0.4;
const FADE_OUT = 2.5;

function run(args) {
  const result = spawnSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.status !== 0) {
    console.error(`ffmpeg failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const files = readdirSync(source);
mkdirSync(OUT, { recursive: true });

for (const cue of CUES) {
  const file = files.find((name) => name.toLowerCase().includes(cue.match));
  if (!file) {
    console.error(`No source file matching "${cue.match}" in ${source}`);
    process.exit(1);
  }
  const input = join(source, file);
  const common = `aformat=channel_layouts=stereo,pan=mono|c0=0.5*c0+0.5*c1,loudnorm=I=${cue.target}:TP=-1.5:LRA=11,aresample=48000`;
  let filter;
  if (cue.loop) {
    // Seamless loop: the tail is crossfaded over the head, then the rest of the take follows, so
    // the end of the file continues into its own start.
    const body = cue.to - cue.from;
    filter = [
      `[0:a]${common},asplit=3[head][mid][tail]`,
      `[head]atrim=${cue.from}:${cue.from + OVERLAP},asetpts=N/SR/TB[h]`,
      `[mid]atrim=${cue.from + OVERLAP}:${cue.to},asetpts=N/SR/TB[m]`,
      `[tail]atrim=${cue.to}:${cue.to + OVERLAP},asetpts=N/SR/TB[t]`,
      `[t][h]acrossfade=d=${OVERLAP}:c1=tri:c2=tri[x]`,
      `[x][m]concat=n=2:v=0:a=1[out]`,
    ].join(';');
    console.log(`${cue.name}: ${body}s seamless loop from ${file}`);
  } else {
    filter = `[0:a]${common},atrim=${cue.from}:${cue.to},asetpts=N/SR/TB,afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${cue.to - cue.from - FADE_OUT}:d=${FADE_OUT}[out]`;
    console.log(`${cue.name}: ${cue.to - cue.from}s sting from ${file}`);
  }

  run(['-hide_banner', '-v', 'error', '-y', '-i', input, '-filter_complex', filter,
    '-map', '[out]', '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on', '-compression_level', '10',
    '-application', 'audio', '-frame_duration', '60', join(OUT, `${cue.name}.opus`)]);
  // Older Safari has no Ogg/Opus. AAC in MP4 plays everywhere; this build of ffmpeg only has
  // AAC-LC, so the fallback runs a little higher to stay clean at mono.
  run(['-hide_banner', '-v', 'error', '-y', '-i', input, '-filter_complex', filter,
    '-map', '[out]', '-c:a', 'aac', '-b:a', '40k', '-movflags', '+faststart',
    join(OUT, `${cue.name}.m4a`)]);
}

let total = 0;
for (const file of readdirSync(OUT)) {
  const size = statSync(join(OUT, file)).size;
  total += size;
  console.log(`${file.padEnd(16)} ${(size / 1024).toFixed(0)} kB`);
}
console.log(`Total ${(total / 1024).toFixed(0)} kB`);
