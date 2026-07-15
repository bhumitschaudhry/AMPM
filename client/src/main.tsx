import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// CLERK DISABLED — uncomment below to re-enable Clerk OAuth support
// import { ClerkProvider } from '@clerk/react';
import App from './App';
import './index.css';

// CLERK DISABLED — uncomment to restore Clerk publishable key lookup
// function getClerkPublishableKey() {
//   return import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
// }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// CLERK DISABLED — original ClerkProvider-wrapped render:
// const app = (
//   <BrowserRouter>
//     <App />
//   </BrowserRouter>
// );
//
// createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     {getClerkPublishableKey() ? (
//       <ClerkProvider publishableKey={getClerkPublishableKey()}>{app}</ClerkProvider>
//     ) : (
//       app
//     )}
//   </StrictMode>
// );
