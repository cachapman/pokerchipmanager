import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

interface ChipConfig {
  color: string; label: string; value: number; count: number; hexColor: string
}
interface Payment {
  amount: number; note: string; ts: string
}
interface Player {
  id: string; name: string
  chips: { color: string; count: number }[]
  payments: Payment[]
}
interface Game {
  id: string; hostName: string; chipConfig: ChipConfig[]
  players: Player[]; status: string; createdAt: string
}

function playerValue(player: Player, chipConfig: ChipConfig[]) {
  return player.chips.reduce((sum, c) => {
    const cfg = chipConfig.find(x => x.color === c.color)
    return sum + (cfg?.value ?? 0) * c.count
  }, 0)
}
function playerPaid(player: Player) {
  return player.payments.reduce((sum, p) => sum + p.amount, 0)
}

export default function HostGame() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [chipEdits, setChipEdits] = useState<Record<string, number>>({})
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const fetchGame = useCallback(async () => {
    try {
      const res = await axios.get(`/api/games/${gameId}`)
      setGame(res.data)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Game not found')
    }
  }, [gameId])

  useEffect(() => {
    fetchGame()
    const interval = setInterval(fetchGame, 5000)
    return () => clearInterval(interval)
  }, [fetchGame])

  function openDistribute(player: Player) {
    setSelectedPlayer(player.id)
    const edits: Record<string, number> = {}
    for (const c of player.chips) edits[c.color] = c.count
    for (const cfg of game!.chipConfig) {
      if (!(cfg.color in edits)) edits[cfg.color] = 0
    }
    setChipEdits(edits)
    setPayAmount('')
    setPayNote('')
  }

  async function saveChips() {
    if (!selectedPlayer || !game) return
    setSaving(true)
    try {
      const chips = Object.entries(chipEdits).map(([color, count]) => ({ color, count }))
      await axios.put(`/api/games/${gameId}/players/${selectedPlayer}/chips`, { chips })
      await fetchGame()
      setSelectedPlayer(null)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save')
    }
    setSaving(false)
  }

  async function recordPayment() {
    if (!selectedPlayer || !payAmount || !game) return
    setSaving(true)
    try {
      await axios.post(`/api/games/${gameId}/players/${selectedPlayer}/payments`, {
        amount: parseFloat(payAmount),
        note: payNote || 'Buy-in'
      })
      await fetchGame()
      setPayAmount('')
      setPayNote('')
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to record payment')
    }
    setSaving(false)
  }

  function copyCode() {
    navigator.clipboard.writeText(gameId || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) return <div className="text-red-400 p-4">{error}</div>
  if (!game) return <div className="text-green-300 p-4">Loading game...</div>

  const player = game.players.find(p => p.id === selectedPlayer)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-green-800 rounded-xl p-5 border border-green-600">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-yellow-400">Hosting: {game.hostName}&apos;s Game</h2>
            <p className="text-green-300 text-sm mt-1">{game.players.length} player(s) joined</p>
          </div>
          <div className="text-right">
            <p className="text-green-300 text-xs mb-1">Game Code</p>
            <button onClick={copyCode}
              className="text-3xl font-mono font-bold text-yellow-400 tracking-widest hover:text-yellow-300 transition">
              {gameId}
            </button>
            {copied && <p className="text-green-400 text-xs">Copied!</p>}
          </div>
        </div>
        <p className="text-green-400 text-xs mt-2">Share this code with players → they go to this site and enter the code</p>
      </div>

      {/* Player list */}
      <div className="space-y-3">
        <h3 className="text-lg font-bold text-green-300">Players</h3>
        {game.players.length === 0 && (
          <p className="text-green-500 italic">No players yet — share the game code!</p>
        )}
        {game.players.map(p => {
          const chipVal = playerValue(p, game.chipConfig)
          const paid = playerPaid(p)
          const net = paid - chipVal
          return (
            <div key={p.id}
              className="bg-green-800 rounded-xl p-4 border border-green-600 cursor-pointer hover:border-yellow-400 transition"
              onClick={() => openDistribute(p)}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-white text-lg">{p.name}</span>
                <span className={`text-sm font-medium ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  Net: {net >= 0 ? '+' : ''}{net.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-sm text-green-300">
                <span>Chips: <span className="text-white">${chipVal.toFixed(2)}</span></span>
                <span>Paid: <span className="text-white">${paid.toFixed(2)}</span></span>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {p.chips.filter(c => c.count > 0).map(c => {
                  const cfg = game.chipConfig.find(x => x.color === c.color)
                  return cfg ? (
                    <span key={c.color} className="flex items-center gap-1 bg-green-700 rounded-full px-2 py-0.5 text-xs">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: cfg.hexColor }} />
                      {c.count}× {cfg.label}
                    </span>
                  ) : null
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Chip config reference */}
      <div className="bg-green-800 rounded-xl p-4 border border-green-600">
        <h3 className="text-sm font-bold text-green-300 mb-2">Chip Values</h3>
        <div className="flex flex-wrap gap-3">
          {game.chipConfig.map(c => (
            <div key={c.color} className="flex items-center gap-1.5 text-sm">
              <span className="w-4 h-4 rounded-full border border-gray-400" style={{ backgroundColor: c.hexColor }} />
              <span className="text-white">{c.label}</span>
              <span className="text-green-400">${c.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Distribute modal */}
      {selectedPlayer && player && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-green-900 rounded-2xl p-6 w-full max-w-md border border-green-600 space-y-5">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-yellow-400">{player.name}</h3>
              <button onClick={() => setSelectedPlayer(null)} className="text-green-400 hover:text-white text-2xl">✕</button>
            </div>

            {/* Chip distribution */}
            <div className="space-y-3">
              <h4 className="text-green-300 font-medium">Distribute Chips</h4>
              {game.chipConfig.map(cfg => (
                <div key={cfg.color} className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full border border-gray-400 flex-shrink-0" style={{ backgroundColor: cfg.hexColor }} />
                  <span className="flex-1 text-sm text-white">{cfg.label} (${cfg.value})</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setChipEdits(e => ({ ...e, [cfg.color]: Math.max(0, (e[cfg.color] || 0) - 1) }))}
                      className="w-7 h-7 bg-green-700 rounded text-white hover:bg-green-600">−</button>
                    <span className="w-8 text-center font-bold text-white">{chipEdits[cfg.color] || 0}</span>
                    <button onClick={() => setChipEdits(e => ({ ...e, [cfg.color]: (e[cfg.color] || 0) + 1 }))}
                      className="w-7 h-7 bg-green-700 rounded text-white hover:bg-green-600">+</button>
                  </div>
                </div>
              ))}
              <div className="text-right text-sm text-green-300">
                Total: ${game.chipConfig.reduce((s, c) => s + c.value * (chipEdits[c.color] || 0), 0).toFixed(2)}
              </div>
              <button onClick={saveChips} disabled={saving}
                className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-2 rounded-lg transition">
                {saving ? 'Saving...' : 'Save Chips'}
              </button>
            </div>

            {/* Record payment */}
            <div className="space-y-3 border-t border-green-700 pt-4">
              <h4 className="text-green-300 font-medium">Record Payment</h4>
              <div className="flex gap-2">
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-green-400">$</span>
                  <input type="number" placeholder="Amount" value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="flex-1 bg-green-700 border border-green-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
                </div>
                <input placeholder="Note (optional)" value={payNote}
                  onChange={e => setPayNote(e.target.value)}
                  className="flex-1 bg-green-700 border border-green-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400" />
              </div>
              <button onClick={recordPayment} disabled={saving || !payAmount}
                className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-green-900 font-bold py-2 rounded-lg transition">
                Record Payment
              </button>
            </div>

            {/* Payment history */}
            {player.payments.length > 0 && (
              <div className="border-t border-green-700 pt-3">
                <h4 className="text-green-300 text-sm font-medium mb-2">Payment History</h4>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {player.payments.map((pay, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-green-400">{pay.note}</span>
                      <span className="text-white">${pay.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="text-right text-sm font-bold text-yellow-400 mt-1">
                  Total: ${playerPaid(player).toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
