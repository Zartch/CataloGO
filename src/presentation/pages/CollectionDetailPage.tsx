import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ItemListQuery } from '../../application/dto';
import { BinaryImage } from '../components/BinaryImage';
import { ItemFilterPanel } from '../components/ItemFilterPanel';
import { Pagination } from '../components/Pagination';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';

const FILTER_QUERY: ItemListQuery = {
  page: 1,
  pageSize: 200,
  sortBy: 'nombre',
  sortDir: 'asc',
};

export function CollectionDetailPage() {
  const { id } = useParams();
  const collectionId = Number(id);
  const { service, configuracion, dataVersion, refreshAll } = useCatalog();
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [query, setQuery] = useState<ItemListQuery>(FILTER_QUERY);
  const [catalogPage, setCatalogPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const referenceData = useAsyncResource(
    async () => {
      if (!service) {
        return { categorias: [], familias: [], colecciones: [], collection: null };
      }
      const [categorias, familias, colecciones, collection] = await Promise.all([
        service.listCategorias(),
        service.listFamilias(),
        service.listColeccionesFlat(),
        service.getColeccion(collectionId),
      ]);
      return { categorias, familias, colecciones, collection };
    },
    [service, dataVersion, collectionId],
  );

  const collectionItems = useAsyncResource(
    async () =>
      service
        ? service.listItems({ ...query, coleccionId: collectionId })
        : { items: [], page: 1, pageSize: 200, total: 0 },
    [service, dataVersion, collectionId, JSON.stringify(query)],
  );

  const addableItems = useAsyncResource(
    async () =>
      service
        ? service.listItems({ ...query, page: catalogPage, coleccionId: query.coleccionId ?? undefined })
        : { items: [], page: 1, pageSize: 200, total: 0 },
    [service, dataVersion, catalogPage, JSON.stringify(query)],
  );

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: configuracion?.moneda ?? 'EUR',
      }),
    [configuracion?.moneda],
  );

  async function handleAddSelected() {
    if (!service || selectedIds.length === 0) {
      return;
    }
    await service.addItemsToCollection(collectionId, selectedIds);
    setSelectedIds([]);
    await refreshAll();
    await collectionItems.refresh();
    await addableItems.refresh();
  }

  async function handleRemove(itemId: number) {
    if (!service || !window.confirm('Se quitara el item de la coleccion. Confirmar.')) {
      return;
    }
    await service.removeItemFromCollection(collectionId, itemId);
    await refreshAll();
    await collectionItems.refresh();
    await addableItems.refresh();
  }

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Gestion de coleccion</p>
          <h1>{referenceData.data?.collection?.nombre ?? 'Coleccion'}</h1>
        </div>
      </section>

      <section className="stack">
        <h2>Items asociados</h2>
        <p className="muted">Contexto fijo: {referenceData.data?.collection?.nombre}</p>
        <div className="simple-list">
          {collectionItems.data?.items.map((item) => (
            <article key={item.id} className="collection-item-row">
              <div className="collection-item-main">
                <BinaryImage
                  bytes={item.fotografia}
                  mime={item.fotografiaMime}
                  alt={item.nombre}
                  className="collection-thumb"
                />
                <div>
                  <strong>{item.nombre}</strong>
                  <p className="muted">
                    {item.codigo} · {formatter.format(item.precio)}
                  </p>
                </div>
              </div>
              <button type="button" className="danger-button" onClick={() => void handleRemove(item.id)}>
                Quitar
              </button>
            </article>
          ))}
        </div>
        {collectionItems.data ? (
          <Pagination
            page={collectionItems.data.page}
            pageSize={collectionItems.data.pageSize}
            total={collectionItems.data.total}
            onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
          />
        ) : null}
      </section>

      <section className="stack">
        <div className="section-heading compact">
          <div>
            <h2>Anadir items</h2>
            <p className="muted">Listado completo con seleccion multiple.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => void handleAddSelected()}>
            Anadir seleccion ({selectedIds.length})
          </button>
        </div>

        <ItemFilterPanel
          query={query}
          categorias={referenceData.data?.categorias ?? []}
          familias={referenceData.data?.familias ?? []}
          colecciones={referenceData.data?.colecciones ?? []}
          expanded={filterExpanded}
          onToggle={() => setFilterExpanded((current) => !current)}
          onChange={(changes) => {
            setCatalogPage(1);
            setQuery((current) => ({ ...current, ...changes }));
          }}
        />

        <div className="selection-grid">
          {addableItems.data?.items.map((item) => (
            <label key={item.id} className="selection-card">
              <input
                type="checkbox"
                checked={selectedIds.includes(item.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...current, item.id]
                      : current.filter((currentId) => currentId !== item.id),
                  )
                }
              />
              <BinaryImage
                bytes={item.fotografia}
                mime={item.fotografiaMime}
                alt={item.nombre}
                className="selection-thumb"
              />
              <div>
                <strong>{item.nombre}</strong>
                <p className="muted">{item.codigo}</p>
              </div>
            </label>
          ))}
        </div>
        {addableItems.data ? (
          <Pagination
            page={addableItems.data.page}
            pageSize={addableItems.data.pageSize}
            total={addableItems.data.total}
            onPageChange={setCatalogPage}
          />
        ) : null}
      </section>
    </div>
  );
}
