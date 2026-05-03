import { useState } from 'react'
import axios from 'axios'

interface ChipConfig {
  color: string; label: string; value: number; hexColor: string
}
interface Player {
  id: string; name: string; isHost?: boolean
  chips: { color: string; count: number }[]
}
interface Game {
  chipConfig: ChipConfig[]
  players: Player[]
  pot: { color: string; count: number }[]
}
interface Props {
  game: Game
  gameId: string
  onRefresh: () => Promise<void>
  onClose: () => void
}

const STEP = 0.25

export default function SplitPot({ game, gameId, onRefresh, onClose }: Props) {
  const potVal = (game.pot ?? []).reduce((sum, c) => {
    const cfg = game.chipConfig.find(x => x.color === c.color)
    return sum + (cfg?.value ?? 0) * c.count
  }, 0)

  const [allocations, setAllocations] = useState<Record<string, number>>(
    Object.fromEntries(game.players.map(p => [p.id, 0]))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totalAllocated = Math.round(Object.values(allocations).reduce((s, v) => s + v, 0) * 100) / 100
  const remaining = Math.round((potVal - totalAllocated) * 100) / 100

  function add(playerId: string) {
    if (remaining < STEP - 0.001) return
    setAllocations(prev => ({
      ...prev,
      [playerId]: Math.round((prev[playerId] + STEP) * 100) / 100,
    }))
  }

  function remove(playerId: string) {
    if ((allocations[playerId] ?? 0) < STEP - 0.001) return
    setAllocations(prev => ({
      ...prev,
      [playerId]: Math.round((prev[playerId] - STEP) * 100) / 100,
    }))
  }

  async function finalize() {
    const splits = Object.entries(allocations)
      .filter(([, amount]) => amount > 0)
      .map(([playerId, amount]) => ({ playerId, amount }))

    if (splits.length === 0) {
      setError('Allocate at least some of the pot first')
      return
    }

    setSaving(true)
    setError('')
    try {
      await axios.post(`/api/games/${gameId}/pot/split`, { splits })
      await onRefresh()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to split pot')
    }
    setSaving(false)
  }

  const isPartial = remaining > 0.001 && totalAllocated > 0

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-green-900 rounded-2xl w-full max-w-md border border-green-600 my-4">
        {/* Header */}
        <div className="flex justify-between items-center sticky top-0 bg-green-900 rounded-t-2xl px-6 pt-5 pb-4 border-b border-green-700 z-10">
          <h3 className="text-xl font-bold text-yellow-400">✂️ Split Pot</h3>
          <button onClick={onClose} className="text-green-400 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Remaining pot display */}
          <div className={`rounded-xl p-4 border text-center ${remaining < 0.001 ? 'bg-green-800 border-green-500' : 'bg-green-800 border-yellow-500'}`}>
            <p className="text-xs text-green-400 mb-1">Remaining Pot</p>
            <p className={`text-4xl font-bold tabular-nums ${remaining < 0.001 ? 'text-green-400' : 'text-yellow-400'}`}>
              ${remaining.toFixed(2)}
            </p>
            <p className="text-xs text-green-500 mt-1">
              of ${potVal.toFixed(2)} total · tap → to allocate $0.25
            </p>
          </div>

          {/* Player rows */}
          <div className="space-y-2">
            {game.players.map(p => {
              const amount = allocations[p.id] ?? 0
              const canAdd = remaining >= STEP - 0.001
              const canRemove = amount >= STEP - 0.001
              return (
                <div key={p.id} className="flex items-center bg-green-800 rounded-xl border border-green-600 overflow-hidden">
                  {/* Left: return $0.25 to pot */}
                  <button
                    onClick={() => remove(p.id)}
                    disabled={!canRemove}
                    className="w-14 py-4 text-2xl font-bold text-orange-400 hover:bg-green-700 active:bg-green-600 disabled:opacity-20 disabled:cursor-not-allowed transition flex items-center justify-center"
                    title="Return $0.25 to pot"
                  >
                    ←
                  </button>

                  {/* Name & allocation */}
                  <div className="flex-1 text-center py-3 select-none">
                    <p className="text-white font-bold text-sm leading-tight">
                      {p.name}
                      {p.isHost && <span className="text-xs text-yellow-400 ml-1">(host)</span>}
                    </p>
                    <p className={`text-xl font-bold tabular-nums mt-0.5 ${amount > 0 ? 'text-green-400' : 'text-green-700'}`}>
                      ${amount.toFixed(2)}
                    </p>
                  </div>

                  {/* Right: take $0.25 from pot */}
                  <button
                    onClick={() => add(p.id)}
                    disabled={!canAdd}
                    className="w-14 py-4 text-2xl font-bold text-green-400 hover:bg-green-700 active:bg-green-600 disabled:opacity-20 disabled:cursor-not-allowed transition flex items-center justify-center"
                    title="Allocate $0.25 from pot"
                  >
                    →
                  </button>
                </div>
              )
            })}
          </div>

          {/* Allocations summary */}
          {totalAllocated > 0 && (
            <div className="bg-green-800/60 rounded-xl p-3 border border-green-700 space-y-1">
              <p className="text-xs text-green-400 font-medium mb-1">Allocations</p>
              {game.players.filter(p => (allocations[p.id] ?? 0) > 0).map(p => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span className="text-white">{p.name}</span>
                  <span className="text-green-400 font-bold">+${(allocations[p.id]).toFixed(2)}</span>
                </div>
              ))}
              {isPartial && (
                <div className="flex justify-between text-sm border-t border-green-700 pt-1 mt-1">
                  <span className="text-orange-400">Stays in pot</span>
                  <span className="text-orange-400 font-bold">${remaining.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setAllocations(Object.fromEntries(game.players.map(p => [p.id, 0])))}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl text-sm transition"
            >
              Reset
            </button>
            <button
              onClick={finalize}
              disabled={saving || totalAllocated < 0.001}
              className={`flex-[2] font-bold py-3 rounded-xl transition disabled:bg-gray-700 disabled:text-gray-500 ${
                isPartial
                  ? 'bg-orange-500 hover:bg-orange-400 text-white'
                  : 'bg-yellow-500 hover:bg-yellow-400 text-green-900'
              }`}
            >
              {saving
                ? 'Splitting...'
                : isPartial
                  ? `Split $${totalAllocated.toFixed(2)} (partial)`
                  : `Finalize Split — $${totalAllocated.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
