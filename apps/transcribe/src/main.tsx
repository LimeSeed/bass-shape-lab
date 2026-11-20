import { createRoot } from 'react-dom/client';
import App from './App';
import { startPWA } from './pwa';
import './style.css';
createRoot(document.getElementById('root')!).render(<App/>);
if (import.meta.env.PROD) startPWA();
