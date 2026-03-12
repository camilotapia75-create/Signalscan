"use client";

interface StatsCardProps {
  icon: string;
  label: string;
  value: string;
}

export default function StatsCard({ icon, label, value }: StatsCardProps) {
  return (
    <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 text-white">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <span className="text-sm font-medium text-white/80">{label}</span>
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}
