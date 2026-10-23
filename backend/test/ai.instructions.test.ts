// Uji pembaca instruksi runtime ai-instructions.md (Task 2).
// node:test bawaan; jalankan: npm test
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readInstructions, clearInstructionsCache } from '../src/ai/ai.instructions.ts';

describe('readInstructions — file runtime', () => {
  afterEach(clearInstructionsCache);

  it('mengembalikan isi file (non-kosong, memuat blok lingkup)', () => {
    const s = readInstructions();
    assert.ok(s.length > 200);
    assert.match(s, /LINGKUP/i);
    assert.match(s, /SUMBER DATA/i);
  });

  it('cache di-refresh saat file berubah (mtime)', () => {
    clearInstructionsCache();
    const sebelum = readInstructions();
    const fs = require('fs');
    const path = require('path');
    // kandidat pertama yang ada pada mode test = cwd/backend/src/ai (cwd=backend)
    const file = path.join(process.cwd(), 'src', 'ai', 'ai-instructions.md');
    fs.appendFileSync(file, '\n<!-- edisi test -->');
    try {
      clearInstructionsCache();
      assert.notEqual(readInstructions(), sebelum);
    } finally {
      fs.writeFileSync(file, sebelum);
      clearInstructionsCache();
      assert.equal(readInstructions(), sebelum);
    }
  });

  it('file tidak ada → string kosong, tidak lempar', () => {
    assert.equal(readInstructions('/absolut/tidak/ada/instruksi.md'), '');
  });
});
