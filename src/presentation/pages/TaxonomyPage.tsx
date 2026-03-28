import { useState } from 'react';
import type { NamedEntity } from '../../domain/entities';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';

interface TaxonomyPageProps {
  entityType: 'categoria' | 'familia';
}

const TAXONOMY_COPY = {
  categoria: {
    title: 'Categorias',
    destroyMessage: 'Los items asociados perderan esta categoria. Confirmar eliminacion.',
  },
  familia: {
    title: 'Familias',
    destroyMessage: 'Los items asociados perderan esta familia. Confirmar eliminacion.',
  },
} as const;

export function TaxonomyPage({ entityType }: TaxonomyPageProps) {
  const { service, dataVersion, refreshAll } = useCatalog();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<NamedEntity | null>(null);
  const copy = TAXONOMY_COPY[entityType];

  const resource = useAsyncResource(
    async () => {
      if (!service) {
        return [];
      }
      return entityType === 'categoria' ? service.listCategorias() : service.listFamilias();
    },
    [service, dataVersion, entityType],
  );

  async function handleSave() {
    if (!service || !draft.trim()) {
      return;
    }
    if (entityType === 'categoria') {
      await service.saveCategoria({ id: editing?.id, nombre: draft });
    } else {
      await service.saveFamilia({ id: editing?.id, nombre: draft });
    }
    setDraft('');
    setEditing(null);
    await refreshAll();
    await resource.refresh();
  }

  async function handleDelete(id: number) {
    if (!service || !window.confirm(copy.destroyMessage)) {
      return;
    }
    if (entityType === 'categoria') {
      await service.deleteCategoria(id);
    } else {
      await service.deleteFamilia(id);
    }
    await refreshAll();
    await resource.refresh();
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">CRUD simple</p>
          <h1>{copy.title}</h1>
        </div>
      </section>

      <section className="inline-form">
        <input
          placeholder={`Nombre de ${entityType}`}
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
        {resource.data?.map((entity) => (
          <article key={entity.id} className="simple-list-row">
            <span>{entity.nombre}</span>
            <div className="action-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditing(entity);
                  setDraft(entity.nombre);
                }}
              >
                Editar
              </button>
              <button type="button" className="danger-button" onClick={() => void handleDelete(entity.id)}>
                Eliminar
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
