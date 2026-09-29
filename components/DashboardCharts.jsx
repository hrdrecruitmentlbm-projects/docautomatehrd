"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";

/**
 * Grafik dashboard.
 *
 * BARU: grafik batang per lini bisnis. Sebelumnya komposisi PKWT/SK/Memo/SP
 * hampir selalu ~95% PKWT — satu donat dengan satu irisan raksasa dan tiga
 * potongan receh, yang tidak menjawab pertanyaan apa pun. lini_bisnis adalah
 * dimensi yang benar-benar dipikirkan HR ("lini bisnis mana yang rekrut?"),
 * dan kolomnya sudah ada.
 *
 * Setiap batang bisa diklik untuk menyaring tabel di bawahnya — filter
 * sebelumnya ada tapi tidak terhubung dengan grafik yang duduk di sebelahnya.
 */

const PALETTE = [
  "var(--brand-600)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const TOOLTIP_STYLE = {
  borderRadius: "8px",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-popover)",
  fontSize: "13px",
};

/** Garis '{{' dan '}}' supaya penanda panjang tidak menjebol label sumbu. */
function shortLine(name) {
  return name.length > 10 ? `${name.slice(0, 9)}…` : name;
}

export function BusinessLineChart({ data, selected, onSelect }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-text-2">
        Belum ada data
      </div>
    );
  }

  const total = data.reduce((n, d) => n + d.value, 0);

  return (
    <div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              horizontal={false}
              stroke="var(--row-border)"
            />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--text-2)", fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              tick={{ fontSize: 11, fill: "var(--text-2)", fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [
                `${value} dokumen (${Math.round((value / total) * 100)}%)`,
                "Jumlah",
              ]}
            />
            <Bar
              dataKey="value"
              radius={[0, 4, 4, 0]}
              maxBarSize={22}
              onClick={(d) => onSelect?.(d?.name)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.name}
                  fill={PALETTE[i % PALETTE.length]}
                  className={cn(
                    "cursor-pointer",
                    selected && selected !== d.name && "opacity-35"
                  )}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Ringkasan yang bisa dibaca screen reader — chart saja tidak
          berarti apa pun tanpa ini. */}
      <p className="sr-only">
        Jumlah dokumen per lini bisnis:{" "}
        {data.map((d) => `${d.name} ${d.value}`).join(", ")}. Total {total} dokumen.
      </p>
    </div>
  );
}

/** Tren jumlah dokumen per bulan — menggantikan "Rata² / Hari". */
export function MonthlyTrendChart({ data, onSelectMonth }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-text-2">
        Belum ada data
      </div>
    );
  }

  const total = data.reduce((n, d) => n + d.total, 0);

  return (
    <div>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="var(--row-border)"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--text-2)", fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--text-2)", fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value, _key, item) => [
                `${value} dokumen`,
                item?.payload?.key || "Bulan",
              ]}
            />
            <Bar
              dataKey="total"
              fill="var(--brand-600)"
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
              cursor={onSelectMonth ? "pointer" : undefined}
              onClick={(d) => onSelectMonth?.(d?.payload?.key)}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        Jumlah dokumen per bulan:{" "}
        {data.map((d) => `${d.key} ${d.total}`).join(", ")}. Total {total}.
      </p>
    </div>
  );
}
