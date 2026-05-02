import { useState } from 'react'
import axios from 'axios'

interface ChipConfig {
  color: string; label: string; value: number; hexColor: string
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
interface Game {
  chipConfig: ChipConfig[]
  players: Player[]
  pot: { color: string; count: number }[]
  potBreakdown?: { playerId: string; playerName: string; value: number }[]
  actionHistory: { type: string; prevState: { players: { id: string }[] } }[]
}

interface Props {
  game: Game
  playerId: string
  gameId: string
  onRefresh: () => Promise<void>
}

export default function BetScreen({ game, playerId, gameId, onRefresh }: Props) {
  const [pendingBet, setPendingBet] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')

  const player = game.players.find(p => p.id === playerId)
  if (!player) return <div className="text-green-400 italic">Player not found in this game.</div>

  function available(color: string) {
    const inStack = player!.chips.find(c => c.color === color)?.count ?? 0
    return inStack - (pendingBet[color] ?? 0)
  }

  function addToBet(color: string) {
    if (available(color) <= 0) return
    setPendingBet(b => ({ ...b, [color]: (b[color] ?? 0) + 1 }))
  }

  function removeFromBet(color: string) {
    setPendingBet(b => {
      const next = { ...b, [color]: Math.max(0, (b[color] ?? 0) - 1) }
      return next
    })
  }

  const pendingTotal = game.chipConfig.reduce(
    (sum, c) => sum + c.value * (pendingBet[c.color] ?? 0), 0
  )
  const hasPendingBet = Object.values(pendingBet).some(v => v > 0)

  const chipValue = player.chips.reduce((sum, c) => {
    const cfg = game.chipConfig.find(x => x.color === c.color)
    return sum + (cfg?.value ?? 0) * c.count
  }, 0)
  const potVal = (game.pot ?? []).reduce((sum, c) => {
    const cfg = game.chipConfig.find(x => x.color === c.color)
    return sum + (cfg?.value ?? 0) * c.count
  }, 0)
  const totalPaid = player.payments.reduce((s, p) => s + p.amount, 0)

  const myBetInPot = (game.potBreakdown ?? []).find(e => e.playerId === playerId)?.value ?? 0
  const totalWagered = player.totalBetsValue ?? 0
  const lastAction = game.actionHistory?.slice(-1)[0]
  const canRecall =
    !hasPendingBet &&
    lastAction?.type === 'pot_contribution' &&
    lastAction?.prevState?.players?.[0]?.id === playerId

  async function placeBet() {
    if (!hasPendingBet) return
    setSaving(true)
    try {
      const chips = Object.entries(pendingBet)
        .filter(([, count]) => count > 0)
        .map(([color, count]) => ({ color, count }))
      await axios.post(`/api/games/${gameId}/pot/contribute`, { playerId, chips })
      setPendingBet({})
      flash(`Bet $${pendingTotal.toFixed(2)} placed!`)
      await onRefresh()
    } catch (e: any) {
      flash(e.response?.data?.error || 'Failed to place bet', true)
    }
    setSaving(false)
  }

  async function recallBet() {
    setSaving(true)
    try {
      await axios.post(`/api/games/${gameId}/undo`)
      flash('Chips recalled!')
      await onRefresh()
    } catch (e: any) {
      flash(e.response?.data?.error || 'Could not recall', true)
    }
    setSaving(false)
  }

  async function recordPayment() {
    if (!payAmount) return
    setSaving(true)
    try {
      await axios.post(`/api/games/${gameId}/players/${playerId}/payments`, {
        amount: parseFloat(payAmount),
        note: payNote || 'Buy-in',
      })
      setPayAmount('')
      setPayNote('')
      flash('Buy-in recorded!')
      await onRefresh()
    } catch (e: any) {
      flash(e.response?.data?.error || 'Failed to record', true)
    }
    setSaving(false)
  }

  function flash(msg: string, _isError = false) {
    setActionMsg(msg)
    setTimeout(() => setActionMsg(''), 3000)
  }

  // All chip types that the player has at least 1 of (including those staged in bet)
  const playerChipColors = new Set(player.chips.filter(c => c.count > 0).map(c => c.color))

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="bg-green-800 rounded-xl p-3 border border-green-600">
          <p className="text-xs text-green-400">My Stack</p>
          <p className="text-lg font-bold text-white">${chipValue.toFixed(2)}</p>
        </div>
        <div className="bg-green-800 rounded-xl p-3 border border-yellow-500">
          <p className="text-xs text-green-400">Pot</p>
          <p className="text-lg font-bold text-yellow-400">${potVal.toFixed(2)}</p>
        </div>
        <div className="bg-green-800 rounded-xl p-3 border border-orange-600">
          <p className="text-xs text-green-400">My Bet in Pot</p>
          <p className="text-lg font-bold text-orange-300">${myBetInPot.toFixed(2)}</p>
        </div>
        <div className="bg-green-800 rounded-xl p-3 border border-green-600">
          <p className="text-xs text-green-400">Total Wagered</p>
          <p className="text-lg font-bold text-green-300">{totalWagered > 0 ? `$${totalWagered.toFixed(2)}` : '—'}</p>
        </div>
      </div>

      {/* Chip stack — tap chips to bet */}
      <div className="bg-green-800 rounded-xl p-5 border border-green-600">
        <h3 className="font-bold text-yellow-400 mb-4">Your Chips — tap to bet</h3>
        {playerChipColors.size === 0 ? (
          <p className="text-green-500 italic text-sm">No chips yet — waiting for host to distribute</p>
        ) : (
          <div className="flex flex-wrap gap-4 justify-center">
            {game.chipConfig.filter(cfg => playerChipColors.has(cfg.color)).map(cfg => {
              const avail = available(cfg.color)
              const inBet = pendingBet[cfg.color] ?? 0
              const total = player.chips.find(c => c.color === cfg.color)?.count ?? 0
              const isLight = cfg.hexColor === '#f8fafc' || cfg.hexColor === '#ffffff'
              return (
                <button
                  key={cfg.color}
                  onClick={() => addToBet(cfg.color)}
                  disabled={avail <= 0}
                  className="flex flex-col items-center gap-1 disabled:opacity-40 active:scale-95 transition-transform select-none"
                >
                  {/* Chip */}
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg font-bold text-sm relative"
                    style={{
                      backgroundColor: cfg.hexColor,
                      color: isLight ? '#333' : '#fff',
                      boxShadow: `0 0 0 4px ${cfg.hexColor}88, 0 0 0 6px white33`,
                      border: '3px dashed rgba(255,255,255,0.35)',
                    }}
                  >
                    ${cfg.value}
                    {inBet > 0 && (
                      <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold border border-white">
                        {inBet}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-green-300">{avail}/{total}</span>
                  <span className="text-xs text-green-500">{cfg.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Pending bet staging area */}
      {hasPendingBet && (
        <div className="bg-green-700 rounded-xl p-4 border-2 border-yellow-500 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-yellow-400">Your Bet</h3>
            <span className="text-xl font-bold text-yellow-300">${pendingTotal.toFixed(2)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {game.chipConfig
              .filter(cfg => (pendingBet[cfg.color] ?? 0) > 0)
              .map(cfg => {
                const isLight = cfg.hexColor === '#f8fafc' || cfg.hexColor === '#ffffff'
                return (
                  <div key={cfg.color} className="flex items-center gap-2 bg-green-800 rounded-full px-3 py-1.5">
                    <span
                      className="w-4 h-4 rounded-full border border-white/30 flex-shrink-0"
                      style={{ backgroundColor: cfg.hexColor }}
                    />
                    <span className={`text-sm font-bold ${isLight ? 'text-gray-300' : 'text-white'}`}>
                      {pendingBet[cfg.color]}× {cfg.label}
                    </span>
                    <button
                      onClick={() => removeFromBet(cfg.color)}
                      className="text-red-400 hover:text-red-300 ml-1 leading-none"
                    >✕</button>
                  </div>
                )
              })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPendingBet({})}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 rounded-lg text-sm transition"
            >
              Clear
            </button>
            <button
              onClick={placeBet}
              disabled={saving}
              className="flex-[2] bg-orange-500 hover:bg-orange-400 disabled:bg-gray-600 text-white font-bold py-2.5 rounded-lg transition"
            >
              {saving ? 'Placing...' : `Bet $${pendingTotal.toFixed(2)} →`}
            </button>
          </div>
        </div>
      )}

      {/* Recall chips (undo last bet, only if it was this player's) */}
      {canRecall && (
        <button
          onClick={recallBet}
          disabled={saving}
          className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl text-sm transition"
        >
          ↩ Recall My Last Bet
        </button>
      )}

      {/* Action flash message */}
      {actionMsg && (
        <p className="text-center text-green-400 text-sm font-medium">{actionMsg}</p>
      )}

      {/* Buy-in recording */}
      <div className="bg-green-800 rounded-xl p-5 border border-green-600 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-yellow-400">Buy-In</h3>
          <span className="text-green-300 text-sm">${totalPaid.toFixed(2)} total</span>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1 flex-1">
            <span className="text-green-400">$</span>
            <input
              type="number"
              placeholder="Amount"
              value={payAmount}
              onChange={e => setPayAmount(e.target.value)}
              className="flex-1 bg-green-700 border border-green-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
            />
          </div>
          <input
            placeholder="Note (optional)"
            value={payNote}
            onChange={e => setPayNote(e.target.value)}
            className="flex-1 bg-green-700 border border-green-500 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
          />
        </div>
        <button
          onClick={recordPayment}
          disabled={saving || !payAmount}
          className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 text-green-900 font-bold py-2 rounded-lg transition"
        >
          Record Buy-In
        </button>
        {player.payments.length > 0 && (
          <div className="space-y-1 max-h-24 overflow-y-auto border-t border-green-700 pt-2">
            {player.payments.map((pay, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-green-400">{pay.note}</span>
                <span className="text-white">${pay.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
