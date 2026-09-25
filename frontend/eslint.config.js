import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

// Lint minimal untuk project ini. Rule inti Task 2: <button> mentah dilarang
// di luar komponen Button — pakai <Button /> dari design system.
// Implementasi Button.jsx sendiri tidak terkena karena rule memeriksa elemen
// JSX <button>, dan file itu hanya punya string "button" di Slot fallback.
// Pengecualian disengaja (dengan komentar eslint-disable per baris):
// toggle switch (role=switch), segmented control kustom, kartu radio,
// tombol bertema khusus, kontrol mikro dalam baris tabel.
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      // inti no-unused-vars tidak mengenali pemakaian via JSX — plugin react
      // yang memberi tahu bahwa <Button /> itu pemakaian variabel Button.
      'react/jsx-uses-vars': 'error',
      'react/forbid-elements': [
        'error',
        { forbid: [{ element: 'button', message: 'Gunakan <Button /> dari src/components/ui/Button.jsx, bukan <button> mentah' }] },
      ],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // regex lama (contract.js) sengaja tidak diubah di task ini
      'no-useless-escape': 'off',
      // catch {} kosong sengaja dipakai (abaikan error, pola repo)
      'no-empty': ['error', { allowEmptyCatch: true }],
      // didefinisikan 'off' agar komentar eslint-disable react-hooks yang sudah
      // tersebar di repo valid; aturan lengkap react-hooks tidak diaktifkan
      // sengaja (di luar scope task ini).
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'test-ui/'],
  },
];
