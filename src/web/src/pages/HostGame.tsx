import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import BetScreen from './BetScreen'

interface ChipConfig {
  color: string; label: string; value: number; count: number; hexColor: string
}
interface Payment {
  amount: number; note: string; ts: string
}
interface Player {
  id: string; name: string; isHost?: boolean
  chips: { color: string; count: number }[]
  payments: Payment[]
  totalBetsValue?: number
}
interface ActionEntry {
  type: string
  description: string
  ts: string
  value?: number
  playerId?: string
  playerName?: string
  winnerId?: string
  winnerName?: string
  prevState: { players: { id: string }[] }
}
interface Game {
  id: string; hostName: string; chipConfig: ChipConfig[]
  players: Player[]; status: string; createdAt: string
  pot: { color: string; count: number }[]
  potBreakdown?: { playerId: string; playerName: string; value: number }[]
  actionHistory: ActionEntry[]
  hostPlayerId?: string
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
function potValue(pot: { color: string; count: number }[], chipConfig: ChipConfig[]) {
  return (pot ?? []).reduce((sum, c) => {
    const cfg = chipConfig.find(x => x.color === c.color)
    return sum + (cfg?.value ?? 0) * c.count
  }, 0)
}

export default function HostGame() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [chipEdits, setChipEdits] = useState<Record<string, number>>({})
  const [potContribEdits, setPotContribEdits] = useState<Record<string, number>>({})
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showAwardPot, setShowAwardPot] = useState(false)
  const [undoMessage, setUndoMessage] = useState('')
  const [tab, setTab] = useState<'manage' | 'mystack'>('manage')

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
    const potEdits: Record<string, number> = {}
    for (const c of player.chips) edits[c.color] = c.count
    for (const cfg of game!.chipConfig) {
      if (!(cfg.color in edits)) edits[cfg.color] = 0
      potEdits[cfg.color] = 0
    }
    setChipEdits(edits)
    setPotContribEdits(potEdits)
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

  async function clearWagered() {
    if (!selectedPlayer || !game) return
    setSaving(true)
    try {
      const p = game.players.find(x => x.id === selectedPlayer)!
      const chips = p.chips.map(c => ({ color: c.color, count: c.count }))
      await axios.put(`/api/games/${gameId}/players/${selectedPlayer}/chips`, { chips, totalBetsValue: 0 })
      await fetchGame()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to clear')
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

  async function contributeToPot() {
    if (!selectedPlayer || !game) return
    const chips = Object.entries(potContribEdits)
      .filter(([, count]) => count > 0)
      .map(([color, count]) => ({ color, count }))
    if (chips.length === 0) return
    setSaving(true)
    try {
      await axios.post(`/api/games/${gameId}/pot/contribute`, { playerId: selectedPlayer, chips })
      await fetchGame()
      setPotContribEdits(Object.fromEntries(Object.keys(potContribEdits).map(k => [k, 0])))
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to contribute to pot')
    }
    setSaving(false)
  }

  async function awardPot(playerId: string) {
    if (!game) return
    setSaving(true)
    try {
      await axios.post(`/api/games/${gameId}/pot/award`, { playerId })
      await fetchGame()
      setShowAwardPot(false)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to award pot')
    }
    setSaving(false)
  }

  async function undoLastAction() {
    if (!game) return
    setSaving(true)
    try {
      const res = await axios.post(`/api/games/${gameId}/undo`)
      await fetchGame()
      setUndoMessage(`Undid: ${res.data.undid}`)
      setTimeout(() => setUndoMessage(''), 3000)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Nothing to undo')
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
  const currentPotValue = potValue(game.pot ?? [], game.chipConfig)
  const hasPotChips = (game.pot ?? []).some(c => c.count > 0)
  const canUndo = (game.actionHistory ?? []).length > 0

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

      {/* Tabs */}
      <div className="flex bg-green-800 rounded-xl border border-green-600 overflow-hidden">
        <button
          onClick={() => setTab('manage')}
          className={`flex-1 py-3 font-bold text-sm transition ${tab === 'manage' ? 'bg-green-600 text-yellow-400' : 'text-green-300 hover:text-white'}`}
        >
          🃏 Manage Game
        </button>
        <button
          onClick={() => setTab('mystack')}
          className={`flex-1 py-3 font-bold text-sm transition ${tab === 'mystack' ? 'bg-green-600 text-yellow-400' : 'text-green-300 hover:text-white'}`}
        >
          🎰 My Stack
        </button>
      </div>

      {/* My Stack tab — host's own bet/buy-in screen */}
      {tab === 'mystack' && game.hostPlayerId && (
        <BetScreen
          game={game}
          playerId={game.hostPlayerId}
          gameId={gameId!}
          onRefresh={fetchGame}
        />
      )}

      {tab === 'manage' && (<>
      <div className="bg-green-800 rounded-xl p-5 border border-green-600">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-yellow-400">🪙 Pot</h3>
          <div className="flex items-center gap-3">
            {undoMessage && <span className="text-green-400 text-sm">{undoMessage}</span>}
            <button onClick={undoLastAction} disabled={!canUndo || saving}
              className="text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white px-3 py-1.5 rounded-lg transition">
              ↩ Undo
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div>
            {!hasPotChips ? (
              <p className="text-green-500 italic text-sm">Pot is empty</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(game.pot ?? []).filter(c => c.count > 0).map(c => {
                  const cfg = game.chipConfig.find(x => x.color === c.color)
                  return cfg ? (
                    <span key={c.color} className="flex items-center gap-1 bg-green-700 rounded-full px-2 py-0.5 text-xs">
                      <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: cfg.hexColor }} />
                      {c.count}× {cfg.label}
                    </span>
                  ) : null
                })}
              </div>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-yellow-400">${currentPotValue.toFixed(2)}</p>
            {hasPotChips && (
              <button onClick={() => setShowAwardPot(true)}
                className="mt-2 bg-yellow-500 hover:bg-yellow-400 text-green-900 font-bold px-4 py-1.5 rounded-lg text-sm transition">
                Award Pot
              </button>
            )}
          </div>
        </div>
        {hasPotChips && (game.potBreakdown ?? []).length > 0 && (
          <div className="mt-3 border-t border-green-700 pt-3">
            <p className="text-xs text-green-400 font-medium mb-2">Contributions this hand</p>
            <div className="space-y-1">
              {(game.potBreakdown ?? []).map(entry => (
                <div key={entry.playerId} className="flex justify-between text-sm">
                  <span className="text-green-300">{entry.playerName}</span>
                  <span className="text-white font-medium">${entry.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
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
          const net = chipVal - paid
          return (
            <div key={p.id}
              className="bg-green-800 rounded-xl p-4 border border-green-600 cursor-pointer hover:border-yellow-400 transition"
              onClick={() => openDistribute(p)}>
              <div className="flex justify-between items-center">
                <span className="font-bold text-white text-lg">
                  {p.name}{p.isHost && <span className="ml-2 text-xs text-yellow-400 font-normal">(host)</span>}
                </span>
                <span className={`text-sm font-medium ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  Net: {net >= 0 ? '+' : ''}{net.toFixed(2)}
                </span>
              </div>
              <div className="flex gap-4 mt-2 text-sm text-green-300">
                <span>Chips: <span className="text-white">${chipVal.toFixed(2)}</span></span>
                <span>Paid: <span className="text-white">${paid.toFixed(2)}</span></span>
                {(p.totalBetsValue ?? 0) > 0 && (
                  <span>Wagered: <span className="text-orange-300">${(p.totalBetsValue ?? 0).toFixed(2)}</span></span>
                )}
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

      {/* Player modal */}
      {selectedPlayer && player && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setSelectedPlayer(null)}>
          <div className="bg-green-900 rounded-2xl w-full max-w-md border border-green-600 my-4"
            onClick={e => e.stopPropagation()}>
            {/* Sticky header so X is always reachable */}
            <div className="flex justify-between items-center sticky top-0 bg-green-900 rounded-t-2xl px-6 pt-5 pb-4 border-b border-green-700 z-10">
              <h3 className="text-xl font-bold text-yellow-400">
                {player.name}{player.isHost && <span className="ml-2 text-xs text-yellow-300 font-normal">(host)</span>}
              </h3>
              <button onClick={() => setSelectedPlayer(null)} className="text-green-400 hover:text-white text-2xl leading-none">✕</button>
            </div>
            <div className="p-6 space-y-5">

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

            {/* Contribute to pot */}
            <div className="space-y-3 border-t border-green-700 pt-4">
              <h4 className="text-green-300 font-medium">🪙 Contribute to Pot</h4>
              {game.chipConfig.map(cfg => {
                const available = player.chips.find(c => c.color === cfg.color)?.count ?? 0
                const contrib = potContribEdits[cfg.color] || 0
                return (
                  <div key={cfg.color} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full border border-gray-400 flex-shrink-0" style={{ backgroundColor: cfg.hexColor }} />
                    <span className="flex-1 text-sm text-white">{cfg.label}
                      <span className="text-green-400 text-xs ml-1">({available} avail)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPotContribEdits(e => ({ ...e, [cfg.color]: Math.max(0, (e[cfg.color] || 0) - 1) }))}
                        className="w-7 h-7 bg-green-700 rounded text-white hover:bg-green-600">−</button>
                      <span className="w-8 text-center font-bold text-white">{contrib}</span>
                      <button onClick={() => setPotContribEdits(e => ({ ...e, [cfg.color]: Math.min(available, (e[cfg.color] || 0) + 1) }))}
                        disabled={contrib >= available}
                        className="w-7 h-7 bg-green-700 rounded text-white hover:bg-green-600 disabled:opacity-30">+</button>
                    </div>
                  </div>
                )
              })}
              <div className="text-right text-sm text-green-300">
                Contributing: ${game.chipConfig.reduce((s, c) => s + c.value * (potContribEdits[c.color] || 0), 0).toFixed(2)}
              </div>
              <button onClick={contributeToPot} disabled={saving || Object.values(potContribEdits).every(v => v === 0)}
                className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-gray-600 text-white font-bold py-2 rounded-lg transition">
                {saving ? 'Saving...' : 'Move Chips to Pot'}
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

            {/* Clear wagered */}
            {(player.totalBetsValue ?? 0) > 0 && (
              <div className="border-t border-green-700 pt-3">
                <div className="flex justify-between items-center">
                  <span className="text-green-400 text-sm">Total wagered: <span className="text-orange-300 font-bold">${(player.totalBetsValue ?? 0).toFixed(2)}</span></span>
                  <button onClick={clearWagered} disabled={saving}
                    className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition">
                    Clear Wagered
                  </button>
                </div>
              </div>
            )}

            {/* Recent activity for this player */}
            {(() => {
              const playerActions = (game.actionHistory ?? [])
                .filter(a => a.playerId === player.id || a.winnerId === player.id)
                .slice(-5)
                .reverse()
              return playerActions.length > 0 ? (
                <div className="border-t border-green-700 pt-3 space-y-2">
                  <h4 className="text-green-300 text-sm font-medium">Recent Activity</h4>
                  {playerActions.map((action, i) => {
                    const isWin = action.type === 'pot_award'
                    return (
                      <div key={i} className="flex justify-between items-start text-sm">
                        <div className="flex items-center gap-2">
                          <span>{isWin ? '🏆' : '🎲'}</span>
                          <div>
                            <p className="text-white leading-tight">{action.description}</p>
                            <p className="text-xs text-green-500">{new Date(action.ts).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        {action.value != null && (
                          <span className={`font-bold ml-2 whitespace-nowrap ${isWin ? 'text-yellow-400' : 'text-orange-300'}`}>
                            {isWin ? '+' : '-'}${action.value.toFixed(2)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : null
            })()}
          </div>
          </div>
        </div>
      )}

      {/* Award Pot modal */}
      {showAwardPot && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-green-900 rounded-2xl p-6 w-full max-w-md border border-green-600 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-yellow-400">Award Pot — ${currentPotValue.toFixed(2)}</h3>
              <button onClick={() => setShowAwardPot(false)} className="text-green-400 hover:text-white text-2xl">✕</button>
            </div>
            <p className="text-green-300 text-sm">Select the winner:</p>
            <div className="space-y-2">
              {game.players.map(p => (
                <button key={p.id} onClick={() => awardPot(p.id)} disabled={saving}
                  className="w-full flex justify-between items-center bg-green-800 hover:bg-green-700 border border-green-600 hover:border-yellow-400 rounded-xl px-4 py-3 transition disabled:opacity-50">
                  <span className="font-bold text-white">
                    {p.name}{p.isHost && <span className="ml-2 text-xs text-yellow-400 font-normal">(host)</span>}
                  </span>
                  <span className="text-green-300 text-sm">${playerValue(p, game.chipConfig).toFixed(2)} in chips</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  )
}
