import fs from 'node:fs';
import path from 'node:path';

// Toleransi sameness mtime (ms): selisih di bawah ini dianggap tak berubah.
const MTIME_TOLERANCE_MS = 1000;

interface InstructionsCache {
  path: string;
  mtimeMs: number;
  text: string;
}

let cache: InstructionsCache | null = null;

// Kandidat path file instruksi — pilih yang pertama ADA:
// override eksplisit, lalu samping modul, lalu dua varian cwd (test = cwd backend/).
const candidatePaths = (overridePath?: string): string[] => {
  if (overridePath) return [overridePath];
  return [
    path.join(__dirname, 'ai-instructions.md'),
    path.join(process.cwd(), 'src', 'ai', 'ai-instructions.md'),
    path.join(process.cwd(), 'backend', 'src', 'ai', 'ai-instructions.md'),
  ];
};

// Baca instruksi sistem dari file runtime. Tidak pernah melempar —
// file tidak ada/tak terbaca → string kosong. Cache satu entri,
// di-refresh saat mtimeMs file berubah melewati toleransi.
export function readInstructions(overridePath?: string): string {
  for (const pathFile of candidatePaths(overridePath)) {
    try {
      const stat = fs.statSync(pathFile);
      if (cache && cache.path === pathFile && Math.abs(cache.mtimeMs - stat.mtimeMs) <= MTIME_TOLERANCE_MS) {
        return cache.text;
      }
      const text = fs.readFileSync(pathFile, 'utf8');
      cache = { path: pathFile, mtimeMs: stat.mtimeMs, text };
      return text;
    } catch {
      // kandidat berikutnya
    }
  }
  return '';
}

export function clearInstructionsCache(): void {
  cache = null;
}
