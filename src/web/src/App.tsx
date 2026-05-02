import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import HostSetup from './pages/HostSetup'
import HostGame from './pages/HostGame'
import PlayerGame from './pages/PlayerGame'

export default function App() {
  return (
    <div className="min-h-screen bg-green-900 text-white">
      <header className="bg-green-800 shadow-lg py-4 px-6">
        <h1 className="text-2xl font-bold text-yellow-400">🃏 Poker Chip Manager</h1>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/host/setup" element={<HostSetup />} />
          <Route path="/host/game/:gameId" element={<HostGame />} />
          <Route path="/game/:gameId" element={<PlayerGame />} />
        </Routes>
      </main>
    </div>
  )
}
