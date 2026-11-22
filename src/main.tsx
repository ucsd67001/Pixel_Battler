import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// StrictMode は使わない（3Dの舞台とバトルの流れが二重に動くため）
createRoot(document.getElementById('root')!).render(<App />);
