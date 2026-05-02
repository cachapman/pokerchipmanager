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

const CHIP_FACE = 20   // height of one chip face in px
const CHIP_GAP  = 13   // vertical offset between chips (overlap)
const CHIP_W    = 62   // width of chip oval
const MAX_VIS   = 10   // max chips rendered visually

function isLightColor(hex: string) {
  return hex === '#f8fafc' || hex === '#ffffff' || hex === '#fafafa'
}

function ChipStack({
  cfg, total, inBet, onAdd, onRemove, disabled,
}: {
  cfg: ChipConfig; total: number; inBet: number
  onAdd: () => void; onRemove: () => void; disabled: boolean
}) {
  const avail = total - inBet
  const visTotal = Math.min(total, MAX_VIS)
  const visInBet = Math.min(inBet, MAX_VIS)
  const stackH = visTotal > 0 ? (visTotal - 1) * CHIP_GAP + CHIP_FACE : CHIP_FACE
  const light = isLightColor(cfg.hexColor)

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      {/* Clickable stack */}
      <button
        onClick={onAdd}
        disabled={disabled || avail <= 0}
        className="flex flex-col items-center disabled:opacity-35 active:scale-95 transition-transform"
        title={`Add one ${cfg.label} to bet`}
      >
        {/* Chip stack visual */}
        <div className="relative" style={{ width: CHIP_W, height: stackH + 4 }}>
          {visTotal === 0 ? (
            <div
              className="absolute rounded-full border-2 border-dashed border-gray-600 bg-gray-800 opacity-30"
              style={{ width: CHIP_W, height: CHIP_FACE, bottom: 0 }}
            />
          ) : (
            Array.from({ length: visTotal }).map((_, i) => {
              const isInBetChip = i < visInBet
              const isTop = i === visTotal - 1
              return (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: CHIP_W,
                    height: CHIP_FACE,
                    bottom: i * CHIP_GAP,
                    backgroundColor: isInBetChip ? '#92400e' : cfg.hexColor,
                    border: `2px dashed ${isInBetChip ? 'rgba(251,146,60,0.7)' : 'rgba(255,255,255,0.35)'}`,
                    boxShadow: isTop
                      ? '0 -3px 8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.2)'
                      : '0 -1px 3px rgba(0,0,0,0.35)',
                    zIndex: i,
                  }}
                >
                  {/* Chip value label on top chip */}
                  {isTop && (
                    <div
                      className="absolute inset-0 flex items-center justify-center font-bold"
                      style={{ fontSize: 11, color: light ? '#374151' : '#fff', textShadow: light ? 'none' : '0 1px 2px rgba(0,0,0,0.6)' }}
                    >
                      ${cfg.value}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Label row */}
        <div className="mt-1.5 text-center">
          <p className="text-xs text-green-400 font-medium">{cfg.label}</p>
          {total > MAX_VIS && (
            <p className="text-xs text-yellow-400">+{total - MAX_VIS} more</p>
          )}
        </div>
      </button>

      {/* Count row: available · X in bet (tappable to remove) */}
      <div className="text-xs text-center leading-tight">
        <span className="text-white font-bold">{avail}</span>
        <span className="text-green-600"> left</span>
        {inBet > 0 && (
          <div className="mt-0.5">
            <button
              onClick={onRemove}
              className="text-orange-400 hover:text-orange-300 underline underline-offset-2"
            >
              {inBet} in bet ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
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
    setPendingBet(b => ({ ...b, [color]: Math.max(0, (b[color] ?? 0) - 1) }))
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

  // Player can only undo if their contribution was the last recorded action
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

  const myChipColors = new Set(player.chips.filter(c => c.count > 0).map(c => c.color))
  // Show all denominations present in config where player has chips
  const chipCfgsWithChips = game.chipConfig.filter(cfg => myChipColors.has(cfg.color))

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

      {/* Visual chip stacks */}
      <div className="bg-green-800 rounded-xl p-5 border border-green-600">
        <p className="font-bold text-yellow-400 mb-5">Your Stack — tap a stack to bet one chip</p>
        {chipCfgsWithChips.length === 0 ? (
          <p className="text-green-500 italic text-sm">No chips yet — waiting for host to distribute</p>
        ) : (
          <div className="flex flex-wrap gap-6 justify-center items-end pb-1">
            {chipCfgsWithChips.map(cfg => {
              const total = player.chips.find(c => c.color === cfg.color)?.count ?? 0
              const inBet = pendingBet[cfg.color] ?? 0
              return (
                <ChipStack
                  key={cfg.color}
                  cfg={cfg}
                  total={total}
                  inBet={inBet}
                  onAdd={() => addToBet(cfg.color)}
                  onRemove={() => removeFromBet(cfg.color)}
                  disabled={saving}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Pending bet confirmation */}
      {hasPendingBet && (
        <div className="bg-green-700 rounded-xl p-4 border-2 border-yellow-500 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-yellow-400">Staged Bet</h3>
            <span className="text-xl font-bold text-yellow-300">${pendingTotal.toFixed(2)}</span>
          </div>
          {/* Mini chip preview */}
          <div className="flex flex-wrap gap-2 items-end justify-center py-1">
            {game.chipConfig.filter(cfg => (pendingBet[cfg.color] ?? 0) > 0).map(cfg => {
              const count = pendingBet[cfg.color] ?? 0
              const visCnt = Math.min(count, 6)
              const miniH = (visCnt - 1) * 10 + 14
              const light = isLightColor(cfg.hexColor)
              return (
                <div key={cfg.color} className="flex flex-col items-center gap-1">
                  <div className="relative" style={{ width: 46, height: miniH }}>
                    {Array.from({ length: visCnt }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute rounded-full"
                        style={{
                          width: 46, height: 14,
                          bottom: i * 10,
                          backgroundColor: cfg.hexColor,
                          border: '2px dashed rgba(255,255,255,0.4)',
                          boxShadow: i === visCnt - 1 ? '0 -2px 6px rgba(0,0,0,0.5)' : undefined,
                          zIndex: i,
                        }}
                      >
                        {i === visCnt - 1 && (
                          <div className="absolute inset-0 flex items-center justify-center"
                            style={{ fontSize: 9, fontWeight: 'bold', color: light ? '#374151' : '#fff' }}>
                            ${cfg.value}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs text-orange-300 font-bold">{count}×</span>
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

      {/* Recall chips */}
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
