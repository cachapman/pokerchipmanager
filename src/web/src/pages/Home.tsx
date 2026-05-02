import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Home() {
  const [joinCode, setJoinCode] = useState('')
  const navigate = useNavigate()

  return (
    <div className="space-y-8">
      <div className="text-center space-y-2">
        <p className="text-green-300 text-lg">Manage your poker chips and track buy-ins</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Host a Game */}
        <div className="bg-green-800 rounded-xl p-6 space-y-4 border border-green-600">
          <h2 className="text-xl font-bold text-yellow-400">🎯 Host a Game</h2>
          <p className="text-green-300 text-sm">Set up chip values, invite players, and manage the game</p>
          <button
            onClick={() => navigate('/host/setup')}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-green-900 font-bold py-3 px-4 rounded-lg transition"
          >
            Create New Game
          </button>
        </div>

        {/* Join a Game */}
        <div className="bg-green-800 rounded-xl p-6 space-y-4 border border-green-600">
          <h2 className="text-xl font-bold text-yellow-400">🙋 Join a Game</h2>
          <p className="text-green-300 text-sm">Enter the game code your host shared with you</p>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Enter game code (e.g. ABC123)"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="w-full bg-green-700 border border-green-500 rounded-lg px-4 py-3 placeholder-green-400 text-white uppercase tracking-widest text-center text-xl focus:outline-none focus:border-yellow-400"
            />
            <button
              onClick={() => joinCode.length === 6 && navigate(`/game/${joinCode}`)}
              disabled={joinCode.length !== 6}
              className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition"
            >
              Join Game
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
