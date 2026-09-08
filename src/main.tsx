import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Avoid React StrictMode double-mount in development, which can trigger TTS / recognition twice.
createRoot(document.getElementById('root')!).render(<App />);
