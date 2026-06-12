"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartProtocol } from "@/lib/cube/schemas";

interface ChartRendererProps {
  chart: ChartProtocol;
  data: Array<Record<string, string | number | null>>;
}

const COLORS = ["#1e6f5c", "#e0a458", "#254f6e", "#c8553d", "#7b6d8d"];

function resolveKey(
  data: ChartRendererProps["data"],
  member: string | undefined
): string | undefined {
  if (!member || !data[0]) return member;
  if (member in data[0]) return member;
  return Object.keys(data[0]).find((key) => key.startsWith(`${member}.`));
}

function formatValue(value: unknown, format: ChartProtocol["valueFormat"]) {
  const number = Number(value ?? 0);
  if (format === "currency") {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      maximumFractionDigits: 2,
    }).format(number);
  }
  if (format === "percent") return `${number.toFixed(2)}%`;
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: 2,
  }).format(number);
}

function formatTableValue(
  value: unknown,
  format: NonNullable<ChartProtocol["columns"]>[number]["format"]
) {
  if (value === null || value === undefined || value === "") return "-";
  if (format === "currency") return formatValue(value, "currency");
  if (format === "number") return formatValue(value, "number");
  if (format === "date" || format === "datetime") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      ...(format === "datetime"
        ? { hour: "2-digit", minute: "2-digit", hour12: false }
        : {}),
    }).format(date);
  }
  return String(value);
}

export function ChartRenderer({ chart, data }: ChartRendererProps) {
  const valueKey = resolveKey(data, chart.value) ?? chart.value;
  const categoryKey = resolveKey(data, chart.category);

  if (!data.length) {
    return <div className="chart-message">当前条件没有数据</div>;
  }

  if (chart.type === "kpi") {
    return (
      <div className="kpi-card">
        <span>{chart.title}</span>
        <strong>{formatValue(data[0]?.[valueKey], chart.valueFormat)}</strong>
      </div>
    );
  }

  if (chart.type === "table" || !categoryKey) {
    const columns =
      chart.columns ??
      Object.keys(data[0]).map((member) => ({
        member,
        title: member,
        format: "text" as const,
      }));
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.member}>{column.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr
                key={`${index}-${String(row[columns[0]?.member] ?? index)}`}
              >
                {columns.map((column) => (
                  <td key={column.member}>
                    {formatTableValue(
                      row[resolveKey(data, column.member) ?? column.member],
                      column.format
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (chart.type === "pie") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip
            formatter={(value) => formatValue(value, chart.valueFormat)}
          />
          <Legend />
          <Pie
            data={data}
            dataKey={valueKey}
            nameKey={categoryKey}
            innerRadius="48%"
            outerRadius="76%"
            paddingAngle={2}
          >
            {data.map((_, index) => (
              <Cell fill={COLORS[index % COLORS.length]} key={index} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const common = (
    <>
      <CartesianGrid stroke="#dfe4df" strokeDasharray="3 5" vertical={false} />
      <XAxis
        dataKey={categoryKey}
        axisLine={false}
        tickLine={false}
        tick={{ fill: "#64716d", fontSize: 12 }}
      />
      <YAxis
        axisLine={false}
        tickLine={false}
        tick={{ fill: "#64716d", fontSize: 12 }}
      />
      <Tooltip
        formatter={(value) => formatValue(value, chart.valueFormat)}
        contentStyle={{ borderRadius: 8, borderColor: "#cad2cd" }}
      />
    </>
  );

  if (chart.type === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 20, left: 5, bottom: 5 }}>
          {common}
          <Line
            type="monotone"
            dataKey={valueKey}
            stroke="#1e6f5c"
            strokeWidth={3}
            dot={{ fill: "#f6f3eb", strokeWidth: 2, r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (chart.type === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 20, right: 20, left: 5, bottom: 5 }}>
          {common}
          <Area
            type="monotone"
            dataKey={valueKey}
            stroke="#1e6f5c"
            fill="#1e6f5c"
            fillOpacity={0.18}
            strokeWidth={3}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 20, right: 20, left: 5, bottom: 5 }}>
        {common}
        <Bar dataKey={valueKey} fill="#1e6f5c" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
