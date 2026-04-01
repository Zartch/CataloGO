import { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './presentation/components/AppLayout';

const HomePage = lazy(() =>
  import('./presentation/pages/HomePage').then((module) => ({ default: module.HomePage })),
);
const ItemsPage = lazy(() =>
  import('./presentation/pages/ItemsPage').then((module) => ({ default: module.ItemsPage })),
);
const ItemFormPage = lazy(() =>
  import('./presentation/pages/ItemFormPage').then((module) => ({
    default: module.ItemFormPage,
  })),
);
const TaxonomyPage = lazy(() =>
  import('./presentation/pages/TaxonomyPage').then((module) => ({
    default: module.TaxonomyPage,
  })),
);
const CollectionsPage = lazy(() =>
  import('./presentation/pages/CollectionsPage').then((module) => ({
    default: module.CollectionsPage,
  })),
);
const CollectionDetailPage = lazy(() =>
  import('./presentation/pages/CollectionDetailPage').then((module) => ({
    default: module.CollectionDetailPage,
  })),
);
const PdfPage = lazy(() =>
  import('./presentation/pages/PdfPage').then((module) => ({ default: module.PdfPage })),
);
const SettingsPage = lazy(() =>
  import('./presentation/pages/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
);
const ItemsFotosYoloPage = lazy(() =>
  import('./presentation/pages/ItemsFotosYoloPage').then((module) => ({
    default: module.ItemsFotosYoloPage,
  })),
);

export function App() {
  return (
    <Suspense fallback={<div className="page-shell centered-page">Cargando vista...</div>}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/items" element={<ItemsPage />} />
          <Route path="/items-fotos-yolo" element={<ItemsFotosYoloPage />} />
          <Route path="/items/nuevo" element={<ItemFormPage />} />
          <Route path="/items/:id" element={<ItemFormPage />} />
          <Route
            path="/categorias"
            element={<TaxonomyPage entityType="categoria" />}
          />
          <Route path="/familias" element={<TaxonomyPage entityType="familia" />} />
          <Route path="/colecciones" element={<CollectionsPage />} />
          <Route path="/colecciones/:id" element={<CollectionDetailPage />} />
          <Route path="/generar-pdf" element={<PdfPage />} />
          <Route path="/configuracion" element={<SettingsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
