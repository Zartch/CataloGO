/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CatalogService } from '../../application/catalogService';
import type { Configuracion } from '../../domain/entities';

interface CatalogContextValue {
  service: CatalogService | null;
  configuracion: Configuracion | null;
  loading: boolean;
  error: string | null;
  dataVersion: number;
  refreshAll: () => Promise<void>;
  saveConfiguracion: (configuracion: Configuracion) => Promise<void>;
  applyThemePreview: (primary: string, secondary: string) => void;
}

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined);

function applyTheme(primary: string, secondary: string) {
  document.documentElement.style.setProperty('--color-primary', primary);
  document.documentElement.style.setProperty('--color-secondary', secondary);
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [service, setService] = useState<CatalogService | null>(null);
  const [configuracion, setConfiguracion] = useState<Configuracion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const [
          databaseModule,
          excelModule,
          pdfModule,
        ] = await Promise.all([
          import('../../infrastructure/database/sqliteCatalogRepository'),
          import('../../infrastructure/services/excelImportService'),
          import('../../infrastructure/services/pdfService'),
        ]);

        const port = new databaseModule.BrowserSqliteDatabasePort();
        const repositories = databaseModule.createRepositoryBundle(port);
        const instance = new CatalogService(
          repositories,
          new excelModule.ExcelImportService(),
          new pdfModule.PdfService(),
        );
        await instance.initialize();
        const loadedConfiguration = await instance.getConfiguracion();
        setService(instance);
        setConfiguracion(loadedConfiguration);
        applyTheme(loadedConfiguration.colorPrimario, loadedConfiguration.colorSecundario);
      } catch (initializationError) {
        setError(
          initializationError instanceof Error
            ? initializationError.message
            : 'No se pudo inicializar la aplicacion.',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo<CatalogContextValue>(
    () => ({
      service,
      configuracion,
      loading,
      error,
      dataVersion,
      refreshAll: async () => {
        if (!service) {
          return;
        }
        const nextConfiguration = await service.getConfiguracion();
        setConfiguracion(nextConfiguration);
        applyTheme(nextConfiguration.colorPrimario, nextConfiguration.colorSecundario);
        setDataVersion((current) => current + 1);
      },
      saveConfiguracion: async (nextConfiguration) => {
        if (!service) {
          return;
        }
        await service.saveConfiguracion(nextConfiguration);
        setConfiguracion(nextConfiguration);
        applyTheme(nextConfiguration.colorPrimario, nextConfiguration.colorSecundario);
        setDataVersion((current) => current + 1);
      },
      applyThemePreview: (primary, secondary) => {
        applyTheme(primary, secondary);
      },
    }),
    [configuracion, dataVersion, error, loading, service],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) {
    throw new Error('CatalogContext no disponible.');
  }
  return context;
}
