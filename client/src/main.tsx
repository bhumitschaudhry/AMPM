import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/react';
import App from './App';
import './index.css';

function getClerkPublishableKey() {
  return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
}

const app = (
  <BrowserRouter>
    <App />
  </BrowserRouter>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {getClerkPublishableKey() ? (
      <ClerkProvider publishableKey={getClerkPublishableKey()}>{app}</ClerkProvider>
    ) : (
      app
    )}
  </StrictMode>
);
