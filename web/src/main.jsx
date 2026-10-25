import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { tg } from './api.js'
import { NavigationProvider } from './navigation.jsx'
import './styles.css'

try { localStorage.removeItem('workout.run') } catch {}

document.documentElement.dataset.theme = 'dark'
if (tg?.initData) {
  tg.ready()
  tg.expand()
  if (tg.isVersionAtLeast?.('6.1')) tg.setBackgroundColor('#1a1c23')
  if (tg.isVersionAtLeast?.('6.9')) tg.setHeaderColor('#1a1c23')
  if (tg.isVersionAtLeast?.('7.10')) tg.setBottomBarColor('#1a1c23')
}

createRoot(document.getElementById('root')).render(
  <BrowserRouter><NavigationProvider><App /></NavigationProvider></BrowserRouter>
)
