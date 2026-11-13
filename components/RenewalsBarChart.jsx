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

const TOOLTIP_STYLE = {
  borderRadius: "8px",
  border: "1px solid var(--border)",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.08)",
  background: "var(--surface-0)",
  color: "var(--text-1)",
  fontSize: "12px",
  padding: "8px 12px",
};

export function RenewalsBarChart({ data = [], activeMonth = "", onSelectMonth }) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center text-xs text-text-2">
        Tidak ada data tren perpanjangan
      </div>
    );
  }

  return (
    <div className="h-60 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          onClick={(state) => {
            if (state && state.activePayload && state.activePayload.length > 0) {
              const clickedData = state.activePayload[0].payload;
              if (clickedData && clickedData.bulan && onSelectMonth) {
                onSelectMonth(clickedData.bulan);
              }
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
          <XAxis
            dataKey="label"
            stroke="var(--text-2)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            stroke="var(--text-2)"
            fontSize={11}
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(val) => [`${val} perpanjangan`, "Jumlah"]}
            labelFormatter={(label, payload) => {
              const item = payload && payload[0]?.payload;
              return item ? `Bulan ${item.label} (${item.bulan})` : label;
            }}
            cursor={{ fill: "var(--surface-2)", opacity: 0.5 }}
          />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} className="cursor-pointer">
            {data.map((entry) => {
              const isSelected = entry.bulan === activeMonth;
              return (
                <Cell
                  key={entry.bulan}
                  fill={isSelected ? "var(--primary)" : "var(--brand-600, #059669)"}
                  opacity={isSelected ? 1 : 0.65}
                />
              );
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
