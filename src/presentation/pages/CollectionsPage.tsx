import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NamedEntity } from '../../domain/entities';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';

export function CollectionsPage() {
  const navigate = useNavigate();
  const { service, dataVersion, refreshAll } = useCatalog();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<NamedEntity | null>(null);

  const resource = useAsyncResource(
    async () => (service ? service.listColecciones() : []),
    [service, dataVersion],
  );

  async function handleSave() {
    if (!service || !draft.trim()) {
      return;
    }
    await service.saveColeccion({ id: editing?.id, nombre: draft });
    setDraft('');
    setEditing(null);
    await refreshAll();
    await resource.refresh();
  }

  async function handleDelete(id: number) {
    if (!service || !window.confirm('Se eliminara la coleccion y sus asociaciones. Confirmar.')) {
      return;
    }
    await service.deleteColeccion(id);
    await refreshAll();
    await resource.refresh();
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Agrupacion N:M</p>
          <h1>Colecciones</h1>
        </div>
      </section>

      <section className="inline-form">
        <input
          placeholder="Nombre de la coleccion"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="button" className="primary-button" onClick={() => void handleSave()}>
          {editing ? 'Guardar cambios' : 'Anadir'}
        </button>
        {editing ? (
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setEditing(null);
              setDraft('');
            }}
          >
            Cancelar
          </button>
        ) : null}
      </section>

      <section className="simple-list">
        {resource.data?.map((collection) => (
          <article key={collection.id} className="simple-list-row">
            <button
              type="button"
              className="collection-link-button"
              onClick={() => navigate(`/colecciones/${collection.id}`)}
            >
              <strong>{collection.nombre}</strong>
              <span className="muted">{collection.itemCount} items</span>
            </button>
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(collection);
                  setDraft(collection.nombre);
                }}
              >
                Editar
              </button>
              <button type="button" className="danger-button" onClick={() => void handleDelete(collection.id)}>
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
