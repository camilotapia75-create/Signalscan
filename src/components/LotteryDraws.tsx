"use client";

interface Draw {
  id: string;
  date: string;
  totalPool: number;
  winnersCount: number;
  prizePerWinner: number;
}

export default function LotteryDraws({ draws }: { draws: Draw[] }) {
  return (
    <div className="bg-white rounded-2xl p-6 mb-6">
      <h2 className="text-lg font-bold text-gray-800 mb-4">📅 Recent Lottery Draws</h2>
      <div className="space-y-3">
        {draws.map((draw) => (
          <div
            key={draw.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
          >
            <div>
              <div className="font-semibold text-gray-800">{draw.date}</div>
              <div className="text-sm text-gray-500">
                {draw.winnersCount} winner{draw.winnersCount !== 1 ? "s" : ""}
              </div>
            </div>
            <div className="text-right">
              <div className="font-bold text-purple-600">${draw.totalPool.toFixed(4)}</div>
              <div className="text-xs text-gray-500">
                ${draw.prizePerWinner.toFixed(4)} each
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
