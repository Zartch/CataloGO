import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useCatalog } from '../context/CatalogContext';
import { BinaryImage } from './BinaryImage';

const NAV_ITEMS = [
  { path: '/', label: 'Home', short: 'HM' },
  { path: '/items', label: 'Items', short: 'IT' },
  { path: '/categorias', label: 'Categorias', short: 'CT' },
  { path: '/familias', label: 'Familias', short: 'FM' },
  { path: '/colecciones', label: 'Colecciones', short: 'CL' },
  { path: '/generar-pdf', label: 'Generar PDF', short: 'PDF' },
  { path: '/configuracion', label: 'Configuracion', short: 'CFG' },
];

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const { configuracion, loading, error } = useCatalog();

  if (loading) {
    return <div className="page-shell centered-page">Inicializando CataloGo...</div>;
  }

  if (error) {
    return <div className="page-shell centered-page">{error}</div>;
  }

  return (
    <div className="app-shell">
      <aside className={`drawer ${open ? 'drawer-open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-logo-shell">
            {configuracion?.logo ? (
              <BinaryImage
                bytes={configuracion.logo}
                mime={configuracion.logoMime}
                alt={configuracion.nombreCompania}
                className="drawer-logo"
              />
            ) : (
              <div className="drawer-logo drawer-logo-fallback">C</div>
            )}
          </div>
          <div>
            <strong>{configuracion?.nombreCompania}</strong>
            {configuracion?.subtitulo ? <p>{configuracion.subtitulo}</p> : null}
          </div>
        </div>
        <nav className="drawer-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              onClick={() => setOpen(false)}
            >
              <span className="nav-icon">{item.short}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open ? <button type="button" className="drawer-backdrop" onClick={() => setOpen(false)} /> : null}

      <div className="page-shell">
        <header className="topbar">
          <button type="button" className="menu-button" onClick={() => setOpen((current) => !current)}>
            Menu
          </button>
          <div className="topbar-brand">
            <span className="eyebrow">PWA local</span>
            <strong>{configuracion?.nombreCompania}</strong>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
