"use client";

interface Win {
  id: string;
  amount: number;
  date: string;
  createdAt: string;
}

export default function WinHistory({ wins }: { wins: Win[] }) {
  return (
    <div className="bg-white rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">🏆 Your Win History</h2>
      <div className="space-y-3">
        {wins.map((win) => (
          <div
            key={win.id}
            className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl"
          >
            <div>
              <div className="font-semibold text-gray-800">{win.date}</div>
              <div className="text-sm text-gray-500">Lottery winner 🎉</div>
            </div>
            <div className="text-lg font-bold text-green-600">
              +${win.amount.toFixed(4)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
