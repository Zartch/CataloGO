import { useState } from 'react';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PdfPage() {
  const { service, dataVersion } = useCatalog();
  const [coleccionId, setColeccionId] = useState<number | null>(null);
  const [familiaIds, setFamiliaIds] = useState<number[]>([]);
  const [mostrarPrecioUnidad, setMostrarPrecioUnidad] = useState(true);
  const [mostrarDescripcion, setMostrarDescripcion] = useState(true);
  const [mostrarSubtitulo, setMostrarSubtitulo] = useState(true);
  const [mostrarContacto, setMostrarContacto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const collections = useAsyncResource(
    async () => (service ? service.listColecciones() : []),
    [service, dataVersion],
  );
  const families = useAsyncResource(
    async () => (service && coleccionId ? service.listFamiliasDeColeccion(coleccionId) : []),
    [service, dataVersion, coleccionId],
  );

  async function handleGenerate() {
    if (!service || !coleccionId) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const bytes = await service.generatePdf({
        coleccionId,
        familiaIds,
        mostrarPrecioUnidad,
        mostrarDescripcion,
        mostrarSubtitulo,
        mostrarContacto,
      });
      downloadBytes(`catalogo-coleccion-${coleccionId}.pdf`, bytes, 'application/pdf');
      setMessage('PDF generado correctamente.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo generar el PDF.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Exportacion cliente</p>
          <h1>Generar PDF</h1>
        </div>
      </section>

      <section className="form-panel">
        <label>
          Coleccion a exportar
          <select
            value={coleccionId ?? ''}
            onChange={(event) => {
              setColeccionId(Number(event.target.value) || null);
              setFamiliaIds([]);
            }}
          >
            <option value="">Seleccionar coleccion</option>
            {collections.data?.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.nombre}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="checkbox-grid">
          <legend>Familias a imprimir</legend>
          {coleccionId ? (
            families.data && families.data.length > 0 ? (
              families.data.map((familia) => (
                <label key={familia.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={familiaIds.includes(familia.id)}
                    onChange={(event) =>
                      setFamiliaIds((current) =>
                        event.target.checked
                          ? [...current, familia.id]
                          : current.filter((idValue) => idValue !== familia.id),
                      )
                    }
                  />
                  {familia.nombre}
                </label>
              ))
            ) : (
              <p className="muted">La coleccion no tiene familias clasificadas. Se imprimiran todos los items.</p>
            )
          ) : (
            <p className="muted">Selecciona una coleccion para filtrar por familias.</p>
          )}
        </fieldset>

        <fieldset className="checkbox-grid">
          <legend>Opciones del catalogo</legend>
          <label className="checkbox-row">
            <input type="checkbox" checked={mostrarPrecioUnidad} onChange={() => setMostrarPrecioUnidad((current) => !current)} />
            Mostrar precio y unidad
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={mostrarDescripcion} onChange={() => setMostrarDescripcion((current) => !current)} />
            Mostrar descripcion
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={mostrarSubtitulo} onChange={() => setMostrarSubtitulo((current) => !current)} />
            Mostrar subtitulo
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={mostrarContacto} onChange={() => setMostrarContacto((current) => !current)} />
            Mostrar contacto
          </label>
        </fieldset>

        <div className="action-row">
          <button type="button" className="primary-button" onClick={() => void handleGenerate()} disabled={busy || !coleccionId}>
            {busy ? 'Generando...' : 'Generar catalogo PDF'}
          </button>
          {message ? <span className="muted">{message}</span> : null}
        </div>
      </section>
    </div>
  );
}
