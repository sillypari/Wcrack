import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { useWcarckStore } from './store/useWcarckStore'
import { Dashboard } from './pages/Dashboard'
import { Reconnaissance } from './pages/Reconnaissance'
import { AttackSurface } from './pages/AttackSurface'
import { EvilTwin } from './pages/EvilTwin'
import { Captures } from './pages/Captures'
import { Credentials } from './pages/Credentials'
import { Logs } from './pages/Logs'
import { Adapters } from './pages/Adapters'
import { Crack } from './pages/Crack'
import { Projects } from './pages/Projects'

function App() {
  const { connectWebSocket } = useWcarckStore()

  useEffect(() => {
    connectWebSocket()
  }, [connectWebSocket])

  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/recon" element={<Reconnaissance />} />
          <Route path="/attack" element={<AttackSurface />} />
          <Route path="/eviltwin" element={<EvilTwin />} />
          <Route path="/captures" element={<Captures />} />
          <Route path="/credentials" element={<Credentials />} />
          <Route path="/crack" element={<Crack />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/adapters" element={<Adapters />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  )
}

export default App
