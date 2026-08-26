import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { PortalApp } from './portal/PortalApp';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 15_000 },
  },
});

/* Portalul clientilor nu trece prin autentificarea de administrare: are linkul si PIN-ul lui */
const estePortal = window.location.pathname.startsWith('/portal');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          {estePortal ? (
            <PortalApp />
          ) : (
            <AuthProvider>
              <App />
            </AuthProvider>
          )}
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
