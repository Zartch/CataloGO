import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SaveItemCommand } from '../../application/dto';
import { prepareItemPhoto } from '../../infrastructure/services/imageService';
import { BinaryImage } from '../components/BinaryImage';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';

const EMPTY_COMMAND: SaveItemCommand = {
  codigo: '',
  nombre: '',
  precio: 0,
  unidadMedida: '',
  descripcion: '',
  categoriaId: null,
  familiaId: null,
  fotografia: null,
  fotografiaMime: null,
  collectionIds: [],
};

export function ItemFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { service, dataVersion, refreshAll } = useCatalog();
  const [command, setCommand] = useState<SaveItemCommand>(EMPTY_COMMAND);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(id);
  const cameraInputId = useId();
  const galleryInputId = useId();

  const resource = useAsyncResource(
    async () => {
      if (!service) {
        return null;
      }
      const [categorias, familias, colecciones, item] = await Promise.all([
        service.listCategorias(),
        service.listFamilias(),
        service.listColeccionesFlat(),
        id ? service.getItem(Number(id)) : Promise.resolve(null),
      ]);
      return { categorias, familias, colecciones, item };
    },
    [service, dataVersion, id],
  );

  useEffect(() => {
    if (!resource.data) {
      return;
    }
    if (resource.data.item) {
      setCommand({
        id: resource.data.item.id,
        codigo: resource.data.item.codigo,
        nombre: resource.data.item.nombre,
        precio: resource.data.item.precio,
        unidadMedida: resource.data.item.unidadMedida,
        descripcion: resource.data.item.descripcion ?? '',
        categoriaId: resource.data.item.categoriaId,
        familiaId: resource.data.item.familiaId,
        fotografia: resource.data.item.fotografia,
        fotografiaMime: resource.data.item.fotografiaMime,
        collectionIds: resource.data.item.colecciones.map((coleccion) => coleccion.id),
      });
      return;
    }
    setCommand(EMPTY_COMMAND);
  }, [resource.data]);

  const selectedCollections = useMemo(() => new Set(command.collectionIds), [command.collectionIds]);

  async function handlePhotoSelection(file?: File) {
    if (!file) {
      return;
    }

    const photo = await prepareItemPhoto(file);
    setCommand((current) => ({
      ...current,
      fotografia: photo.bytes,
      fotografiaMime: photo.mime,
    }));
  }

  async function handleSave() {
    if (!service) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await service.saveItem(command);
      await refreshAll();
      navigate('/items');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el item.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!service || !command.id) {
      return;
    }
    if (!window.confirm('Se eliminara el item. Confirmar.')) {
      return;
    }
    await service.deleteItem(command.id);
    await refreshAll();
    navigate('/items');
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Formulario dedicado</p>
          <h1>{isEdit ? 'Editar item' : 'Nuevo item'}</h1>
        </div>
      </section>

      {resource.loading ? <p>Cargando formulario...</p> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="form-panel">
        <div className="form-grid">
          <label>
            Codigo
            <input value={command.codigo} onChange={(event) => setCommand((current) => ({ ...current, codigo: event.target.value }))} />
          </label>
          <label>
            Nombre
            <input value={command.nombre} onChange={(event) => setCommand((current) => ({ ...current, nombre: event.target.value }))} />
          </label>
          <label>
            Precio
            <input
              type="number"
              min="0"
              step="0.01"
              value={command.precio}
              onChange={(event) =>
                setCommand((current) => ({ ...current, precio: Number(event.target.value) }))
              }
            />
          </label>
          <label>
            Unidad de medida
            <input
              value={command.unidadMedida}
              onChange={(event) => setCommand((current) => ({ ...current, unidadMedida: event.target.value }))}
            />
          </label>
          <label>
            Categoria
            <select
              value={command.categoriaId ?? ''}
              onChange={(event) =>
                setCommand((current) => ({
                  ...current,
                  categoriaId: event.target.value ? Number(event.target.value) : null,
                }))
              }
            >
              <option value="">Sin categoria</option>
              {resource.data?.categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Familia
            <select
              value={command.familiaId ?? ''}
              onChange={(event) =>
                setCommand((current) => ({
                  ...current,
                  familiaId: event.target.value ? Number(event.target.value) : null,
                }))
              }
            >
              <option value="">Sin familia</option>
              {resource.data?.familias.map((familia) => (
                <option key={familia.id} value={familia.id}>
                  {familia.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field-block">
          Descripcion
          <textarea
            rows={4}
            value={command.descripcion ?? ''}
            onChange={(event) => setCommand((current) => ({ ...current, descripcion: event.target.value }))}
          />
        </label>

        <div className="photo-picker">
          <div>
            <p className="field-label">Fotografia</p>
            <div className="photo-actions">
              <label className="primary-button file-button" htmlFor={cameraInputId}>
                Hacer foto
                <input
                  id={cameraInputId}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => void handlePhotoSelection(event.target.files?.[0])}
                />
              </label>
              <label className="secondary-button file-button" htmlFor={galleryInputId}>
                Elegir de galeria
                <input
                  id={galleryInputId}
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handlePhotoSelection(event.target.files?.[0])}
                />
              </label>
            </div>
          </div>
          <BinaryImage
            bytes={command.fotografia}
            mime={command.fotografiaMime}
            alt={command.nombre || 'Foto del item'}
            className="item-image-preview"
          />
        </div>

        <fieldset className="checkbox-grid">
          <legend>Colecciones</legend>
          {resource.data?.colecciones.map((coleccion) => (
            <label key={coleccion.id} className="checkbox-row">
              <input
                type="checkbox"
                checked={selectedCollections.has(coleccion.id)}
                onChange={(event) =>
                  setCommand((current) => ({
                    ...current,
                    collectionIds: event.target.checked
                      ? [...current.collectionIds, coleccion.id]
                      : current.collectionIds.filter((idValue) => idValue !== coleccion.id),
                  }))
                }
              />
              {coleccion.nombre}
            </label>
          ))}
        </fieldset>

        <div className="action-row">
          <button type="button" className="secondary-button" onClick={() => navigate('/items')}>
            Cancelar
          </button>
          {isEdit ? (
            <button type="button" className="danger-button" onClick={() => void handleDelete()}>
              Eliminar
            </button>
          ) : null}
          <button type="button" className="primary-button" onClick={() => void handleSave()} disabled={busy}>
            {busy ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </section>
    </div>
  );
}
