import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

interface ChipConfig {
  color: string
  label: string
  value: number
  count: number
  hexColor: string
}

const DEFAULT_CHIPS: ChipConfig[] = [
  { color: 'white',  label: 'White',  value: 1,   count: 20, hexColor: '#f8fafc' },
  { color: 'red',    label: 'Red',    value: 5,   count: 20, hexColor: '#ef4444' },
  { color: 'blue',   label: 'Blue',   value: 10,  count: 15, hexColor: '#3b82f6' },
  { color: 'green',  label: 'Green',  value: 25,  count: 10, hexColor: '#22c55e' },
  { color: 'black',  label: 'Black',  value: 100, count: 5,  hexColor: '#1f2937' },
]

export default function HostSetup() {
  const [hostName, setHostName] = useState('')
  const [chips, setChips] = useState<ChipConfig[]>(DEFAULT_CHIPS)
  const [isPublic, setIsPublic] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function updateChip(index: number, field: keyof ChipConfig, value: string | number) {
    const updated = [...chips]
    updated[index] = { ...updated[index], [field]: value }
    setChips(updated)
  }

  function addChip() {
    setChips([...chips, { color: 'purple', label: 'Purple', value: 50, count: 10, hexColor: '#a855f7' }])
  }

  function removeChip(index: number) {
    setChips(chips.filter((_, i) => i !== index))
  }

  async function createGame() {
    if (!hostName.trim()) { setError('Enter your name'); return }
    if (chips.length === 0) { setError('Add at least one chip type'); return }
    setLoading(true)
    setError('')
    try {
      const res = await axios.post('/api/games', { hostName: hostName.trim(), chipConfig: chips, isPublic })
      localStorage.setItem(`host_${res.data.id}`, res.data.hostPlayerId)
      navigate(`/host/game/${res.data.id}`)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to create game')
      setLoading(false)
    }
  }

  const totalValue = chips.reduce((sum, c) => sum + c.value * c.count, 0)

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-yellow-400">Set Up Your Game</h2>

      {/* Host name */}
      <div className="bg-green-800 rounded-xl p-6 border border-green-600">
        <label className="block text-green-300 mb-2 font-medium">Your Name (Host)</label>
        <input
          value={hostName}
          onChange={e => setHostName(e.target.value)}
          placeholder="Enter your name"
          className="w-full bg-green-700 border border-green-500 rounded-lg px-4 py-3 text-white placeholder-green-400 focus:outline-none focus:border-yellow-400"
        />
      </div>

      {/* Visibility toggle */}
      <div className="bg-green-800 rounded-xl p-5 border border-green-600">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-white">
              {isPublic ? '🌐 Public Game' : '🔒 Private Game'}
            </p>
            <p className="text-xs text-green-400 mt-0.5">
              {isPublic
                ? 'Appears on the home screen — anyone can find and join'
                : 'Only joinable with the game code — not listed publicly'}
            </p>
          </div>
          <button
            onClick={() => setIsPublic(p => !p)}
            className={`relative w-14 h-7 rounded-full transition-colors duration-200 focus:outline-none ${isPublic ? 'bg-yellow-500' : 'bg-gray-600'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform duration-200 ${isPublic ? 'translate-x-7' : 'translate-x-0'}`}
            />
          </button>
        </div>
      </div>

      {/* Chip config */}
      <div className="bg-green-800 rounded-xl p-6 border border-green-600 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-bold text-yellow-400">Chip Configuration</h3>
          <span className="text-green-300 text-sm">Total stack: ${totalValue}</span>
        </div>

        <div className="space-y-3">
          {chips.map((chip, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-gray-400 flex-shrink-0"
                style={{ backgroundColor: chip.hexColor }} />
              <input
                value={chip.label}
                onChange={e => updateChip(i, 'label', e.target.value)}
                placeholder="Name"
                className="flex-1 bg-green-700 border border-green-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
              />
              <div className="flex items-center gap-1">
                <span className="text-green-400 text-sm">$</span>
                <input
                  type="number"
                  value={chip.value}
                  onChange={e => updateChip(i, 'value', parseFloat(e.target.value) || 0)}
                  className="w-20 bg-green-700 border border-green-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-green-400 text-sm">×</span>
                <input
                  type="number"
                  value={chip.count}
                  onChange={e => updateChip(i, 'count', parseInt(e.target.value) || 0)}
                  className="w-16 bg-green-700 border border-green-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
                />
              </div>
              <input
                type="color"
                value={chip.hexColor}
                onChange={e => updateChip(i, 'hexColor', e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
              />
              <button onClick={() => removeChip(i)} className="text-red-400 hover:text-red-300 text-lg">✕</button>
            </div>
          ))}
        </div>

        <button onClick={addChip}
          className="text-yellow-400 hover:text-yellow-300 text-sm font-medium">
          + Add chip type
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={createGame}
        disabled={loading}
        className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-green-900 font-bold py-4 rounded-xl text-lg transition"
      >
        {loading ? 'Creating...' : '🃏 Create Game'}
      </button>
    </div>
  )
}
