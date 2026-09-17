#!/usr/bin/env node
/**
 * Builds the home page's sky video from a source render (any format ffmpeg reads, e.g. FFV1 MKV).
 *
 *   npm run video:sky -- "D:\Videos\chess-vid.mkv"
 *
 * The 3D wrap is baked in: each frame is mapped onto the inside of a cylinder seen from the floor's
 * eye height, so the video's bottom edge lands exactly on the arcade horizon (80% down the screen).
 * Frames are dimmed so text stays readable, and the loop dips through black at the seam.
 *
 * Outputs to public/video/:
 *   sky-wide-1080.mp4, sky-wide-720.mp4   16:9, for laptops, desktops and landscape tablets
 *   sky-tall-1080.mp4, sky-tall-720.mp4   4:5 center crop, for phones and portrait tablets
 *   sky-wide.jpg, sky-tall.jpg            still frames for light effects mode and reduced motion
 *
 * All AVC (H.264, 8-bit 4:2:0, High profile): the codec every phone and older laptop GPU decodes
 * in hardware. Requires ffmpeg and ffprobe on the PATH.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run video:sky -- <source video>');
  process.exit(1);
}

const OUT = join(import.meta.dirname, '..', 'public', 'video');
const FADE = 0.8; // seconds of dip to black at each end of the loop
const DIM = 0.66; // brightness multiplier baked into every frame
const POSTER_AT = 90; // seconds into the video for the still frames

function run(command, args) {
  const result = spawnSync(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (result.status !== 0) {
    console.error(`${command} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

const probe = spawnSync(
  'ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', input],
  { encoding: 'utf8' },
);
const duration = Number.parseFloat(probe.stdout);
if (!Number.isFinite(duration)) {
  console.error(`Couldn't read the duration of ${input}`);
  process.exit(1);
}
console.log(`Source: ${input} (${duration.toFixed(2)} s)`);
mkdirSync(OUT, { recursive: true });

// Cylinder wrap. The source is padded to twice its height so its bottom edge sits at elevation 0.
// With a 77.5° vertical view, looking up 25.7° puts elevation 0 at 80% of the frame height.
const wrap = [
  'pad=1920:2160:0:0:black',
  'v360=input=cylindrical:output=flat:ih_fov=160:iv_fov=115:h_fov=110:v_fov=77.5:pitch=25.7:w=1920:h=1080:interp=lanczos',
  'format=gbrp',
  `colorchannelmixer=rr=${DIM}:gg=${DIM}:bb=${DIM}`,
  'format=yuv420p',
  `fade=t=in:st=0:d=${FADE}`,
  `fade=t=out:st=${(duration - FADE).toFixed(3)}:d=${FADE}`,
].join(',');

const filter = [
  `[0:v]${wrap},split=4[w1][w2][t1][t2]`,
  '[w1]null[wide1080]',
  '[w2]scale=1280:720:flags=lanczos[wide720]',
  '[t1]crop=864:1080:528:0[tall1080]',
  '[t2]crop=864:1080:528:0,scale=576:720:flags=lanczos[tall720]',
].join(';');

const renditions = [
  { label: 'wide1080', file: 'sky-wide-1080.mp4', crf: 27, level: '4.0' },
  { label: 'wide720', file: 'sky-wide-720.mp4', crf: 28, level: '3.1' },
  { label: 'tall1080', file: 'sky-tall-1080.mp4', crf: 27, level: '4.0' },
  { label: 'tall720', file: 'sky-tall-720.mp4', crf: 28, level: '3.1' },
];

const args = ['-hide_banner', '-y', '-i', input, '-filter_complex', filter];
for (const { label, file, crf, level } of renditions) {
  args.push(
    '-map',
    `[${label}]`,
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    String(crf),
    '-tune',
    'film',
    '-x264-params',
    'aq-mode=3',
    '-profile:v',
    'high',
    '-level',
    level,
    '-pix_fmt',
    'yuv420p',
    '-g',
    '50',
    '-movflags',
    '+faststart',
    join(OUT, file),
  );
}
console.log('Encoding four renditions (this takes a while)…');
run('ffmpeg', args);

for (const shape of ['wide', 'tall']) {
  run('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-ss',
    String(Math.min(POSTER_AT, duration / 2)),
    '-i',
    join(OUT, `sky-${shape}-1080.mp4`),
    '-frames:v',
    '1',
    '-q:v',
    '4',
    join(OUT, `sky-${shape}.jpg`),
  ]);
}

let total = 0;
for (const file of [...renditions.map((r) => r.file), 'sky-wide.jpg', 'sky-tall.jpg']) {
  const size = statSync(join(OUT, file)).size;
  total += size;
  console.log(`${file.padEnd(20)} ${(size / 1048576).toFixed(1)} MB`);
}
console.log(`Total ${(total / 1048576).toFixed(1)} MB`);
if (renditions.some((r) => statSync(join(OUT, r.file)).size > 45 * 1048576)) {
  console.warn('A file is over 45 MB. GitHub rejects files over 100 MB and warns above 50 MB.');
}
