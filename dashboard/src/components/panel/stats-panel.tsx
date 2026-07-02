"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import { Card } from "@/components/ui/card";

// memory_used_mb arrive en string : le backend charge le proto avec
// `longs: String` (@grpc/proto-loader) pour éviter les pertes de précision
// sur les int64, contrairement à cpu_usage_pct qui est un double.
interface StatsUpdateEvent {
  serverId: string;
  cpu_usage_pct: number;
  memory_used_mb: string;
}

interface Sample {
  t: number;
  value: number;
}

const HISTORY_SECONDS = 60;

function statusColor(pct: number): string {
  if (pct >= 90) return "var(--status-critical)";
  if (pct >= 70) return "var(--status-warning)";
  return "var(--status-good)";
}

function Sparkline({ history, color }: { history: Sample[]; color: string }) {
  const width = 240;
  const height = 48;
  const [hover, setHover] = useState<{ x: number; sample: Sample } | null>(null);

  if (history.length < 2) {
    return <div className="flex h-12 items-center text-xs text-muted-foreground">En attente de données...</div>;
  }

  const max = Math.max(...history.map((s) => s.value), 1);
  const minT = history[0].t;
  const maxT = history[history.length - 1].t;
  const spanT = Math.max(maxT - minT, 1);

  const points = history.map((s) => ({
    x: ((s.t - minT) / spanT) * width,
    y: height - (s.value / max) * (height - 6) - 3,
    sample: s,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height} L0,${height} Z`;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    let closest = points[0];
    for (const p of points) {
      if (Math.abs(p.x - x) < Math.abs(closest.x - x)) closest = p;
    }
    setHover({ x: closest.x, sample: closest.sample });
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-12 w-full cursor-crosshair"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
    >
      <path d={areaPath} fill={color} opacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {hover && (
        <>
          <line x1={hover.x} y1={0} x2={hover.x} y2={height} stroke="currentColor" strokeOpacity={0.2} strokeWidth={1} />
          <circle cx={hover.x} cy={points.find((p) => p.sample === hover.sample)!.y} r={3} fill={color} />
        </>
      )}
      {hover && (
        <foreignObject x={Math.min(Math.max(hover.x - 40, 0), width - 80)} y={-4} width={80} height={20}>
          <div className="rounded bg-popover px-1.5 py-0.5 text-center text-[10px] text-popover-foreground ring-1 ring-border">
            {hover.sample.value.toFixed(1)}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

function StatTile({
  label,
  currentValue,
  displayValue,
  limitValue,
  unit,
  history,
  color,
}: {
  label: string;
  currentValue: number;
  displayValue: string;
  limitValue: number;
  unit: string;
  history: Sample[];
  color: string;
}) {
  const pct = limitValue > 0 ? Math.min((currentValue / limitValue) * 100, 100) : 0;

  return (
    <Card className="gap-3">
      <div className="flex items-baseline justify-between px-4">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold tracking-tight">{displayValue}</span>
      </div>

      <div className="flex flex-col gap-1 px-4">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full transition-[width]"
            style={{ width: `${pct}%`, backgroundColor: statusColor(pct) }}
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {pct.toFixed(0)}% de {limitValue.toLocaleString()} {unit} alloués
        </span>
      </div>

      <div className="px-4 pb-1">
        <Sparkline history={history} color={color} />
      </div>
    </Card>
  );
}

export function StatsPanel({
  serverId,
  cpuLimitPct,
  memoryLimitMb,
}: {
  serverId: string;
  cpuLimitPct: number;
  memoryLimitMb: number;
}) {
  const [cpuHistory, setCpuHistory] = useState<Sample[]>([]);
  const [ramHistory, setRamHistory] = useState<Sample[]>([]);
  const [connected, setConnected] = useState(false);
  const lastRef = useRef<{ cpu: number; ram: number } | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socket.emit("stats:subscribe", { serverId });

    const onUpdate = (evt: StatsUpdateEvent) => {
      if (evt.serverId !== serverId) return;
      const cpuValue = evt.cpu_usage_pct;
      const ramValue = Number(evt.memory_used_mb);
      lastRef.current = { cpu: cpuValue, ram: ramValue };
      setConnected(true);
      const now = Date.now();
      const cutoff = now - HISTORY_SECONDS * 1000;
      setCpuHistory((prev) => [...prev, { t: now, value: cpuValue }].filter((s) => s.t >= cutoff));
      setRamHistory((prev) => [...prev, { t: now, value: ramValue }].filter((s) => s.t >= cutoff));
    };

    socket.on("stats:update", onUpdate);

    return () => {
      socket.emit("stats:unsubscribe", { serverId });
      socket.off("stats:update", onUpdate);
    };
  }, [serverId]);

  const cpu = lastRef.current?.cpu ?? 0;
  const ram = lastRef.current?.ram ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {!connected && <p className="text-xs text-muted-foreground">Connexion aux statistiques temps réel...</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile
          label="CPU"
          currentValue={cpu}
          displayValue={`${cpu.toFixed(0)}%`}
          limitValue={cpuLimitPct}
          unit="%"
          history={cpuHistory}
          color="var(--stat-cpu)"
        />
        <StatTile
          label="Mémoire"
          currentValue={ram}
          displayValue={ram >= 1024 ? `${(ram / 1024).toFixed(1)} Go` : `${ram.toFixed(0)} Mo`}
          limitValue={memoryLimitMb}
          unit="Mo"
          history={ramHistory}
          color="var(--stat-ram)"
        />
      </div>
    </div>
  );
}
