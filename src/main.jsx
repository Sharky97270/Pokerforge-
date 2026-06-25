import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { pfCloudBootstrap } from './cloud.js'

async function boot() {
  // Restaure les données depuis le cloud (non bloquant > 5s) avant de monter l'app,
  // puis active la sauvegarde automatique de toutes les rubriques pf_*.
  try { await pfCloudBootstrap() } catch {}
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
boot()
