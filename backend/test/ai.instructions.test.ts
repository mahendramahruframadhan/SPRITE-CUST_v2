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

  it('instruksi memuat nilai tool audit/invoice + tanpa kata "snapshot"', () => {
    const s = readInstructions();
    assert.doesNotMatch(s, /snapshot/i, 'instruksi tidak boleh memakai kata "snapshot"');
    assert.match(s, /BELUM DIVALIDASI/, 'instruksi harus sebut nilai audit BELUM DIVALIDASI');
    assert.match(s, /VALID - SIAP INVOICE/, 'instruksi harus sebut nilai audit VALID - SIAP INVOICE');
    assert.match(s, /PERLU DICEK ULANG/, 'instruksi harus sebut nilai audit PERLU DICEK ULANG');
    assert.match(s, /MENUNGGU INVOICE/, 'instruksi harus sebut nilai invoice MENUNGGU INVOICE');
    assert.match(s, /INVOICE TERBIT/, 'instruksi harus sebut nilai invoice INVOICE TERBIT');
    assert.match(s, /DIKIRIM/, 'instruksi harus sebut nilai invoice DIKIRIM');
    assert.match(s, /PAID/, 'instruksi harus sebut nilai invoice PAID');
  });
});
