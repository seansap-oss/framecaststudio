import { mkdir, copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
// Explicit allowlist: credentials, local renders and Python never enter a public build.
const files = ['index.html', 'studio.css', 'editor-workspace.css', 'sample.js',
  'studio.js', 'layers.js', 'timeline.js', 'editing.js', 'workspace.js',
  'image-editing.js', 'editor-core.js', 'editor-workspace.js', 'tracks.js', 'publish.js', 'ticker-inspector.js', 'render-ranges.js', 'frame-seek.js', 'deterministic-export.js'];
await rm(path.join(root, 'dist'), { recursive: true, force: true });
await mkdir(path.join(root, 'dist'), { recursive: true });
await Promise.all(files.map(file => copyFile(path.join(root, file), path.join(root, 'dist', file))));
console.log(`FrameCast Studio v0.11.2: ${files.length} public files built into dist/`);
