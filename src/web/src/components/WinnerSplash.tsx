import { useEffect, useState } from 'react'

const PHRASES = [
  "Winner! 🏆",
  "Rake it in! 💰",
  "I hope you're happy! 😏",
  "Bazinga! ⚡",
  "Show me the money! 💵",
  "Ka-ching! 🤑",
  "Pot is yours! 🪙",
  "Clean sweep! 🧹",
  "Big baller! 🎱",
  "Daddy needs a new pair of shoes! 🎲",
  "Take the money and run! 🏃",
  "Not today, table! 😎",
  "Luck? Never heard of her. 🃏",
  "They never stood a chance! 😈",
]

const COLORS = ['#f43f5e', '#f97316', '#facc15', '#4ade80', '#60a5fa', '#a78bfa', '#f472b6', '#34d399']

function rand(a: number, b: number) { return a + Math.random() * (b - a) }

interface Piece { id: number; x: number; color: string; w: number; h: number; duration: number; delay: number; rotate: number }

export default function WinnerSplash({ amount, onDone }: { amount: number; onDone: () => void }) {
  const [phrase] = useState(() => PHRASES[Math.floor(Math.random() * PHRASES.length)])
  const [visible, setVisible] = useState(true)
  const [pieces] = useState<Piece[]>(() =>
    Array.from({ length: 70 }, (_, i) => ({
      id: i,
      x: rand(2, 98),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      w: rand(7, 14),
      h: rand(4, 9),
      duration: rand(1.8, 3.2),
      delay: rand(0, 0.9),
      rotate: rand(0, 360),
    }))
  )

  useEffect(() => {
    const fadeTimer = setTimeout(() => setVisible(false), 2400)
    const doneTimer = setTimeout(onDone, 2800)
    return () => { clearTimeout(fadeTimer); clearTimeout(doneTimer) }
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none overflow-hidden"
      style={{ transition: 'opacity 0.4s', opacity: visible ? 1 : 0 }}
    >
      {pieces.map(p => (
        <div
          key={p.id}
          className="absolute top-0 rounded-sm"
          style={{
            left: `${p.x}%`,
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confettiFall ${p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}

      <div
        className="bg-green-950/95 border-4 border-yellow-400 rounded-3xl px-10 py-8 text-center shadow-2xl"
        style={{ animation: 'splashPop 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
      >
        <p className="text-6xl mb-3">🏆</p>
        <p className="text-3xl font-extrabold text-yellow-400 mb-2">{phrase}</p>
        <p className="text-2xl font-bold text-green-300">+${amount.toFixed(2)}</p>
      </div>
    </div>
  )
}
