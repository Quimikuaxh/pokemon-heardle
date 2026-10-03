import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Sin StrictMode: el doble montaje de desarrollo duplicaria la llamada de calentamiento a /health.
createRoot(document.getElementById('root')!).render(<App />)
