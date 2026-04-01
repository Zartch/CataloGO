import { Link } from 'react-router-dom';
import { useCatalog } from '../context/CatalogContext';
import { useAsyncResource } from '../hooks/useAsyncResource';
import { BinaryImage } from '../components/BinaryImage';

const HOME_CARDS = [
  { path: '/items', title: 'Items', description: 'Inventario visual', icon: 'IT' },
  { path: '/items-fotos-yolo', title: 'Items Fotos YOLO', description: 'Captura rapida de fotos pendientes', icon: 'YO' },
  { path: '/categorias', title: 'Categorias', description: 'Clasificacion base', icon: 'CT' },
  { path: '/familias', title: 'Familias', description: 'Agrupacion principal', icon: 'FM' },
  { path: '/colecciones', title: 'Colecciones', description: 'Seleccion para catalogo', icon: 'CL' },
  { path: '/generar-pdf', title: 'Generar PDF', description: 'Catalogo listo para imprimir', icon: 'PDF' },
  { path: '/configuracion', title: 'Configuracion', description: 'Marca, colores y datos', icon: 'CFG' },
];

const SUMMARY_CARDS = [
  { key: 'totalItems', label: 'Items', icon: 'IT' },
  { key: 'totalCategorias', label: 'Categorias', icon: 'CT' },
  { key: 'totalFamilias', label: 'Familias', icon: 'FM' },
  { key: 'totalColecciones', label: 'Colecciones', icon: 'CL' },
] as const;

export function HomePage() {
  const { service, configuracion, dataVersion } = useCatalog();
  const dashboard = useAsyncResource(
    async () =>
      service
        ? service.getDashboardSummary()
        : {
            totalItems: 0,
            totalCategorias: 0,
            totalFamilias: 0,
            totalColecciones: 0,
          },
    [service, dataVersion],
  );

  return (
    <div className="stack-large">
      <section className="hero-panel">
        <div className="hero-brand">
          <div className="hero-logo-row">
            {configuracion?.logo ? (
              <BinaryImage
                bytes={configuracion.logo}
                mime={configuracion.logoMime}
                alt={configuracion.nombreCompania}
                className="hero-logo hero-logo-wide"
              />
            ) : (
              <div className="hero-logo hero-logo-fallback hero-logo-wide">CataloGo</div>
            )}
          </div>
          <div className="hero-copy-block">
            <p className="eyebrow">Inventario local y catalogos PDF</p>
            <h1>{configuracion?.nombreCompania}</h1>
            {configuracion?.subtitulo ? <p className="hero-copy">{configuracion.subtitulo}</p> : null}
          </div>
        </div>

        <div className="stats-grid">
          {SUMMARY_CARDS.map((card) => (
            <article key={card.key} className="stat-card stat-card-compact">
              <span className="icon-chip icon-chip-light">{card.icon}</span>
              <div>
                <span>{card.label}</span>
                <strong>{dashboard.data?.[card.key] ?? 0}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-grid">
        {HOME_CARDS.map((card) => (
          <Link key={card.path} to={card.path} className="dashboard-card">
            <div className="dashboard-card-head">
              <span className="icon-chip">{card.icon}</span>
              <div>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
