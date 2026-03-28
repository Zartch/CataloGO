import { useEffect, useState } from 'react';
import type { Configuracion } from '../../domain/entities';
import { prepareLogo } from '../../infrastructure/services/imageService';
import { BinaryImage } from '../components/BinaryImage';
import { useCatalog } from '../context/CatalogContext';

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const MONEDAS = ['EUR', 'USD', 'GBP'];

export function SettingsPage() {
  const { service, configuracion, saveConfiguracion, refreshAll, applyThemePreview } = useCatalog();
  const [draft, setDraft] = useState<Configuracion | null>(configuracion);
  const [message, setMessage] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<string[]>([]);

  useEffect(() => {
    setDraft(configuracion);
  }, [configuracion]);

  useEffect(() => {
    if (draft) {
      applyThemePreview(draft.colorPrimario, draft.colorSecundario);
    }
  }, [applyThemePreview, draft]);

  if (!draft) {
    return <p>Cargando configuracion...</p>;
  }

  async function handleSave() {
    if (!draft) {
      return;
    }
    setMessage(null);
    try {
      await saveConfiguracion(draft);
      setMessage('Configuracion guardada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuracion.');
    }
  }

  async function handleExportDatabase() {
    if (!service) {
      return;
    }
    const bytes = await service.exportDatabase();
    downloadBytes('catalogogo.sqlite', bytes, 'application/octet-stream');
  }

  async function handleImportDatabase(file: File) {
    if (!service || !window.confirm('Esta accion reemplaza la base de datos actual. Confirmar.')) {
      return;
    }
    await service.importDatabase(file);
    await refreshAll();
    setMessage('Base de datos importada.');
  }

  async function handleImportExcel(file: File) {
    if (!service) {
      return;
    }
    const result = await service.importExcel(file);
    await refreshAll();
    setImportReport([
      `Nuevos items: ${result.importedCount}`,
      `Items actualizados: ${result.updatedCount}`,
      `Categorias detectadas: ${result.createdCategories}`,
      `Familias detectadas: ${result.createdFamilies}`,
      `Colecciones detectadas: ${result.createdCollections}`,
      ...result.rowErrors.map((error) => `Fila ${error.rowNumber}: ${error.reason}`),
    ]);
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Identidad y datos</p>
          <h1>Configuracion</h1>
        </div>
      </section>

      <section className="form-panel">
        <div className="form-grid">
          <label>
            Nombre de la compania
            <input value={draft.nombreCompania} onChange={(event) => setDraft((current) => current ? { ...current, nombreCompania: event.target.value } : current)} />
          </label>
          <label>
            Subtitulo
            <input value={draft.subtitulo ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, subtitulo: event.target.value } : current)} />
          </label>
          <label>
            Email
            <input value={draft.email ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, email: event.target.value } : current)} />
          </label>
          <label>
            Telefono
            <input value={draft.telefono ?? ''} onChange={(event) => setDraft((current) => current ? { ...current, telefono: event.target.value } : current)} />
          </label>
          <label>
            Color primario
            <input type="color" value={draft.colorPrimario} onChange={(event) => setDraft((current) => current ? { ...current, colorPrimario: event.target.value } : current)} />
          </label>
          <label>
            Color secundario
            <input type="color" value={draft.colorSecundario} onChange={(event) => setDraft((current) => current ? { ...current, colorSecundario: event.target.value } : current)} />
          </label>
          <label>
            Moneda
            <select value={draft.moneda} onChange={(event) => setDraft((current) => current ? { ...current, moneda: event.target.value } : current)}>
              {MONEDAS.map((moneda) => (
                <option key={moneda} value={moneda}>
                  {moneda}
                </option>
              ))}
            </select>
          </label>
          <label>
            Logo
            <input
              type="file"
              accept=".svg,image/png,image/jpeg"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                const nextLogo = await prepareLogo(file);
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        logo: nextLogo.bytes,
                        logoMime: nextLogo.mime,
                      }
                    : current,
                );
              }}
            />
          </label>
        </div>

        <div className="logo-preview">
          <BinaryImage bytes={draft.logo} mime={draft.logoMime} alt={draft.nombreCompania} className="hero-logo" />
        </div>

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void handleSave()}>
            Guardar configuracion
          </button>
          {message ? <span className="muted">{message}</span> : null}
        </div>
      </section>

      <section className="form-panel">
        <h2>Import / Export</h2>
        <div className="stack">
          <label>
            Importar Excel (.xls, .xlsx)
            <input
              type="file"
              accept=".xls,.xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImportExcel(file);
                }
              }}
            />
          </label>
          <div className="action-row">
            <button type="button" className="secondary-button" onClick={() => void handleExportDatabase()}>
              Exportar SQLite
            </button>
            <label className="secondary-button file-button">
              Importar SQLite
              <input
                type="file"
                accept=".sqlite,.db"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void handleImportDatabase(file);
                  }
                }}
              />
            </label>
          </div>
          {importReport.length > 0 ? (
            <div className="report-box">
              {importReport.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
