import { useState } from 'react'

interface Player {
  id: string; name: string
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
  splits?: { playerId: string; playerName: string; amount: number }[]
}
interface Game {
  players: Player[]
  actionHistory: ActionEntry[]
}
interface Props {
  game: Game
}

function actionIcon(type: string) {
  if (type === 'undo') return '↩'
  if (type === 'pot_award') return '🏆'
  if (type === 'pot_split') return '✂️'
  return '🎲'
}

function amountStyle(type: string) {
  if (type === 'undo') return 'text-red-400'
  if (type === 'pot_award' || type === 'pot_split') return 'text-green-400'
  return 'text-orange-300'
}

function amountPrefix(type: string) {
  if (type === 'pot_award' || type === 'pot_split') return '+'
  return ''
}

export default function EventLog({ game }: Props) {
  const [filterPlayerId, setFilterPlayerId] = useState<string>('all')

  // Actions are stored oldest-first — show in that order
  const actions: ActionEntry[] = game.actionHistory ?? []

  const filtered = filterPlayerId === 'all'
    ? actions
    : actions.filter(a =>
        a.playerId === filterPlayerId ||
        a.winnerId === filterPlayerId ||
        (a.splits ?? []).some(s => s.playerId === filterPlayerId)
      )

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-green-800 rounded-xl p-4 border border-green-600 flex items-center gap-3">
        <label className="text-green-300 text-sm font-medium whitespace-nowrap">Filter:</label>
        <select
          value={filterPlayerId}
          onChange={e => setFilterPlayerId(e.target.value)}
          className="flex-1 bg-green-700 border border-green-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-yellow-400"
        >
          <option value="all">All Players</option>
          {game.players.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="text-green-500 text-xs whitespace-nowrap">{filtered.length} events</span>
      </div>

      {/* Event list */}
      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <p className="text-green-500 italic text-sm text-center py-8">No events yet</p>
        ) : (
          filtered.map((action, i) => {
            const isUndo = action.type === 'undo'
            return (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
                  isUndo
                    ? 'bg-red-900/20 border-red-900/40'
                    : 'bg-green-800 border-green-700'
                }`}
              >
                <span className="text-base mt-0.5 flex-shrink-0 w-5 text-center">
                  {actionIcon(action.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium leading-tight ${isUndo ? 'text-red-300' : 'text-white'}`}>
                    {action.description}
                  </p>
                  <p className="text-xs text-green-500 mt-0.5">
                    {new Date(action.ts).toLocaleTimeString()}
                  </p>
                </div>
                {action.value != null && (
                  <span className={`font-bold whitespace-nowrap flex-shrink-0 ${amountStyle(action.type)}`}>
                    {amountPrefix(action.type)}${Math.abs(action.value).toFixed(2)}
                    {isUndo && <span className="text-xs ml-0.5">(reverted)</span>}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
