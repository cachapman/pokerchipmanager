import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import BetScreen from './BetScreen'
import WinnerSplash from '../components/WinnerSplash'

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
  prevState?: { players: { id: string }[] }
}
interface Game {
  id: string; hostName: string; chipConfig: ChipConfig[]
  players: Player[]; status: string
  pot: { color: string; count: number }[]
  potBreakdown?: { playerId: string; playerName: string; value: number }[]
  actionHistory: ActionEntry[]
}

export default function PlayerGame() {
  const { gameId } = useParams<{ gameId: string }>()
  const [game, setGame] = useState<Game | null>(null)
  const [playerId, setPlayerId] = useState(() => localStorage.getItem(`player_${gameId}`) || '')
  const [nameInput, setNameInput] = useState('')
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'bet' | 'details'>('bet')
  const [splashAmount, setSplashAmount] = useState<number | null>(null)
  const [betNotification, setBetNotification] = useState<{ playerName: string; amount: number } | null>(null)
  const lastSeenActionTs = useRef<string | null>(null)

  const fetchGame = useCallback(async () => {
    try {
      const res = await axios.get(`/api/games/${gameId}`)
      const incoming: Game = res.data
      if (playerId && incoming.actionHistory?.length) {
        const last = incoming.actionHistory[incoming.actionHistory.length - 1]
        const isNew = last.ts !== lastSeenActionTs.current
        if (isNew) {
          const isFirstLoad = lastSeenActionTs.current === null
          if (last.type === 'pot_award' && last.winnerId === playerId) {
            setSplashAmount(last.value ?? 0)
          } else if (last.type === 'pot_contribution' && !isFirstLoad) {
            setBetNotification({ playerName: last.playerName ?? 'Someone', amount: last.value ?? 0 })
            setTimeout(() => setBetNotification(null), 3000)
          }
          lastSeenActionTs.current = last.ts
        }
      }
      setGame(incoming)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Game not found')
    }
  }, [gameId, playerId])

  useEffect(() => {
    fetchGame()
    const interval = setInterval(fetchGame, 5000)
    return () => clearInterval(interval)
  }, [fetchGame])

  async function joinGame() {
    if (!nameInput.trim()) { setError('Enter your name'); return }
    setJoining(true)
    setError('')
    try {
      const res = await axios.post(`/api/games/${gameId}/players`, { name: nameInput.trim() })
      const id = res.data.playerId
      setPlayerId(id)
      localStorage.setItem(`player_${gameId}`, id)
      await fetchGame()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to join')
    }
    setJoining(false)
  }

  if (error) return <div className="text-red-400 p-4 bg-red-900/20 rounded-xl">{error}</div>
  if (!game) return <div className="text-green-300 p-4">Looking up game {gameId}...</div>

  // Not joined yet
  if (!playerId) {
    return (
      <div className="space-y-6">
        <div className="bg-green-800 rounded-xl p-6 border border-green-600">
          <h2 className="text-xl font-bold text-yellow-400 mb-1">Join Game</h2>
          <p className="text-green-300 text-sm">Hosted by <span className="text-white font-medium">{game.hostName}</span></p>
        </div>
        <div className="bg-green-800 rounded-xl p-6 border border-green-600 space-y-4">
          <label className="block text-green-300 font-medium">Your Name</label>
          <input
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && joinGame()}
            placeholder="Enter your name"
            className="w-full bg-green-700 border border-green-500 rounded-lg px-4 py-3 text-white placeholder-green-400 focus:outline-none focus:border-yellow-400"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button onClick={joinGame} disabled={joining}
            className="w-full bg-blue-500 hover:bg-blue-400 disabled:bg-gray-600 text-white font-bold py-3 rounded-xl transition">
            {joining ? 'Joining...' : 'Join Game'}
          </button>
        </div>
      </div>
    )
  }

  const me = game.players.find(p => p.id === playerId)
  if (!me) return <div className="text-green-300 p-4">Waiting for host to add you...</div>

  const chipVal = me.chips.reduce((sum, c) => {
    const cfg = game.chipConfig.find(x => x.color === c.color)
    return sum + (cfg?.value ?? 0) * c.count
  }, 0)
  const paid = me.payments.reduce((sum, p) => sum + p.amount, 0)
  const net = chipVal - paid

  return (
    <div className="space-y-5">
      {betNotification && (
        <div className="fixed top-4 inset-x-4 z-50 flex justify-center pointer-events-none">
          <div className="bg-gray-900 border-2 border-orange-400 rounded-2xl px-6 py-3 shadow-2xl text-center max-w-xs w-full">
            <p className="text-orange-400 text-xs font-bold tracking-widest uppercase mb-0.5">Bet Placed 🎲</p>
            <p className="text-white font-bold text-xl">
              {betNotification.playerName === me?.name ? 'You' : betNotification.playerName}
              {' '}bet{' '}
              <span className="text-orange-300">${betNotification.amount.toFixed(2)}</span>
            </p>
          </div>
        </div>
      )}
      {splashAmount !== null && (
        <WinnerSplash amount={splashAmount} onDone={() => setSplashAmount(null)} />
      )}
      {/* Header */}
      <div className="bg-green-800 rounded-xl p-4 border border-green-600">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-white">{me.name}</h2>
            <p className="text-green-300 text-xs">in {game.hostName}&apos;s game · <span className="font-mono text-yellow-400">{gameId}</span></p>
          </div>
          <div className="text-right">
            <p className="text-xs text-green-300">Net P&amp;L</p>
            <p className={`text-xl font-bold ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {net >= 0 ? '+' : ''}${net.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-green-800 rounded-xl border border-green-600 overflow-hidden">
        <button
          onClick={() => setTab('bet')}
          className={`flex-1 py-3 font-bold text-sm transition ${tab === 'bet' ? 'bg-green-600 text-yellow-400' : 'text-green-300 hover:text-white'}`}
        >
          🎰 Bet
        </button>
        <button
          onClick={() => setTab('details')}
          className={`flex-1 py-3 font-bold text-sm transition ${tab === 'details' ? 'bg-green-600 text-yellow-400' : 'text-green-300 hover:text-white'}`}
        >
          📋 Details
        </button>
      </div>

      {/* Bet tab */}
      {tab === 'bet' && (
        <BetScreen
          game={game}
          playerId={playerId}
          gameId={gameId!}
          onRefresh={fetchGame}
        />
      )}

      {/* Details tab */}
      {tab === 'details' && (
        <div className="space-y-5">
          {/* Chip stack */}
          <div className="bg-green-800 rounded-xl p-5 border border-green-600">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-yellow-400">Your Chip Stack</h3>
              <span className="text-white font-bold text-lg">${chipVal.toFixed(2)}</span>
            </div>
            {me.chips.filter(c => c.count > 0).length === 0 ? (
              <p className="text-green-500 italic text-sm">No chips yet — waiting for host to distribute</p>
            ) : (
              <div className="space-y-2">
                {me.chips.filter(c => c.count > 0).map(c => {
                  const cfg = game.chipConfig.find(x => x.color === c.color)
                  return cfg ? (
                    <div key={c.color} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full border border-gray-400" style={{ backgroundColor: cfg.hexColor }} />
                        <span className="text-white text-sm">{cfg.label} (${cfg.value})</span>
                      </div>
                      <span className="text-white font-medium">{c.count} × = ${(c.count * cfg.value).toFixed(2)}</span>
                    </div>
                  ) : null
                })}
              </div>
            )}
          </div>

          {/* Payments */}
          <div className="bg-green-800 rounded-xl p-5 border border-green-600">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-yellow-400">Buy-In History</h3>
              <span className="text-white font-bold">${paid.toFixed(2)} paid</span>
            </div>
            {me.payments.length === 0 ? (
              <p className="text-green-500 italic text-sm">No payments recorded yet</p>
            ) : (
              <div className="space-y-1">
                {me.payments.map((pay, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-green-300">{pay.note} · <span className="text-xs text-green-500">{new Date(pay.ts).toLocaleTimeString()}</span></span>
                    <span className="text-white">${pay.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          {game.actionHistory.length > 0 && (
            <div className="bg-green-800 rounded-xl p-5 border border-green-600">
              <h3 className="font-bold text-yellow-400 mb-3">Recent Activity</h3>
              <div className="space-y-2">
                {[...game.actionHistory].reverse().slice(0, 5).map((action, i) => {
                  const isWin = action.type === 'pot_award'
                  const isMine = action.playerId === playerId || action.winnerId === playerId
                  return (
                    <div key={i} className={`flex justify-between items-start text-sm rounded-lg px-3 py-2 ${isMine ? 'bg-green-700/60 border border-green-600' : 'bg-green-900/40'}`}>
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
            </div>
          )}

          {/* Other players */}
          {game.players.filter(p => p.id !== playerId).length > 0 && (
            <div className="bg-green-800 rounded-xl p-5 border border-green-600">
              <h3 className="font-bold text-yellow-400 mb-3">Other Players</h3>
              <div className="space-y-2">
                {game.players.filter(p => p.id !== playerId).map(p => {
                  const pv = p.chips.reduce((s, c) => {
                    const cfg = game.chipConfig.find(x => x.color === c.color)
                    return s + (cfg?.value ?? 0) * c.count
                  }, 0)
                  return (
                    <div key={p.id} className="flex justify-between text-sm">
                      <span className="text-white">{p.name}{p.isHost && <span className="ml-1 text-xs text-yellow-400">(host)</span>}</span>
                      <div className="text-right">
                        <span className="text-green-300">${pv.toFixed(2)} in chips</span>
                        {(p.totalBetsValue ?? 0) > 0 && (
                          <span className="text-orange-300 ml-2">${(p.totalBetsValue ?? 0).toFixed(2)} wagered</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
