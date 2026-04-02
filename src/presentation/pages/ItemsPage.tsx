import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ItemListQuery } from '../../application/dto';
import { BinaryImage } from '../components/BinaryImage';
import { ItemFilterPanel } from '../components/ItemFilterPanel';
import { Pagination } from '../components/Pagination';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { formatItemCategorySummary } from '../utils/itemTaxonomy';

const DEFAULT_QUERY: ItemListQuery = {
  page: 1,
  pageSize: 200,
  sortBy: 'nombre',
  sortDir: 'asc',
};

export function ItemsPage() {
  const navigate = useNavigate();
  const { service, configuracion, dataVersion } = useCatalog();
  const [query, setQuery] = useState<ItemListQuery>(DEFAULT_QUERY);
  const [expanded, setExpanded] = useState(false);

  const referenceData = useAsyncResource(
    async () => {
      if (!service) {
        return { categorias: [], familias: [], colecciones: [] };
      }
      const [categorias, familias, colecciones] = await Promise.all([
        service.listCategorias(),
        service.listFamilias(),
        service.listColeccionesFlat(),
      ]);
      return { categorias, familias, colecciones };
    },
    [service, dataVersion],
  );

  const itemsResource = useAsyncResource(
    async () =>
      service
        ? service.listItems(query)
        : { items: [], page: 1, pageSize: 200, total: 0 },
    [service, dataVersion, JSON.stringify(query)],
  );

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: configuracion?.moneda ?? 'EUR',
      }),
    [configuracion?.moneda],
  );

  return (
    <div className="stack-large">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Inventario</p>
          <h1>Items</h1>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-button" onClick={() => navigate('/items-fotos-yolo')}>
            Fotos YOLO
          </button>
          <button type="button" className="primary-button" onClick={() => navigate('/items/nuevo')}>
            Nuevo item
          </button>
        </div>
      </section>

      <ItemFilterPanel
        query={query}
        categorias={referenceData.data?.categorias ?? []}
        familias={referenceData.data?.familias ?? []}
        colecciones={referenceData.data?.colecciones ?? []}
        expanded={expanded}
        onToggle={() => setExpanded((current) => !current)}
        onChange={(changes) => setQuery((current) => ({ ...current, ...changes }))}
      />

      <section className="item-grid">
        {itemsResource.loading ? <p>Cargando items...</p> : null}
        {itemsResource.data?.items.length ? (
          itemsResource.data.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="item-card"
              onClick={() => navigate(`/items/${item.id}`)}
            >
              <div className="item-image-wrap">
                <BinaryImage
                  bytes={item.fotografia}
                  mime={item.fotografiaMime}
                  alt={item.nombre}
                  className="item-image"
                />
              </div>
              <div className="item-card-body">
                <h2>{item.nombre}</h2>
                <p className="muted">{item.codigo}</p>
                <strong>{formatter.format(item.precio)}</strong>
                <p>{item.unidadMedida}</p>
                <p className="muted">{formatItemCategorySummary(item)}</p>
                <p className="muted">
                  {item.colecciones.length > 0
                    ? item.colecciones.map((coleccion) => coleccion.nombre).join(', ')
                    : 'Sin colecciones'}
                </p>
              </div>
            </button>
          ))
        ) : (
          <div className="empty-state">No hay items para este filtro.</div>
        )}
      </section>

      {itemsResource.data ? (
        <Pagination
          page={itemsResource.data.page}
          pageSize={itemsResource.data.pageSize}
          total={itemsResource.data.total}
          onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
        />
      ) : null}
    </div>
  );
}
