import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './i18n';
import './index.css';
import { CatalogProvider } from './presentation/context/CatalogContext';

registerSW({ immediate: true });

const routerMode = import.meta.env.VITE_ROUTER_MODE;
const routerProps = routerMode === 'hash' ? {} : { basename: import.meta.env.BASE_URL };
const app = <App />;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CatalogProvider>
      {routerMode === 'hash' ? (
        <HashRouter>{app}</HashRouter>
      ) : (
        <BrowserRouter {...routerProps}>{app}</BrowserRouter>
      )}
    </CatalogProvider>
  </React.StrictMode>,
);
