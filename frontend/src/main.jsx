import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './lib/charts.js'; // registrasi Chart.js terpusat (satu kali untuk semua halaman)
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
