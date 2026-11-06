import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { CodeTotals, DayPoint } from "@/lib/vanity/stats";

const statusConfig = {
  exists: { label: "Em uso", color: "var(--status-exists)" },
  notFound: { label: "Sem convite ativo", color: "var(--status-notfound)" },
  errors: { label: "Erros/limites", color: "var(--status-inconclusive)" },
} satisfies ChartConfig;
const successConfig = {
  success: { label: "Taxa de sucesso (%)", color: "var(--primary)" },
} satisfies ChartConfig;
const latencyConfig = {
  avgMs: { label: "Tempo médio (ms)", color: "var(--chart-2)" },
} satisfies ChartConfig;

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-lg border bg-card p-3 sm:p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default function DashboardCharts({
  days,
  totals,
}: {
  days: DayPoint[];
  totals: CodeTotals;
}) {
  const hasChecks = days.some((d) => d.checks > 0);
  const hasLatency = days.some((d) => d.avgMs !== null);
  const pie = [
    { key: "exists", value: totals.exists },
    { key: "notFound", value: totals.notFound },
    { key: "errors", value: totals.errors },
  ].filter((p) => p.value > 0);
  const tick = { fontSize: 11 };
  const interval = days.length > 14 ? Math.ceil(days.length / 7) - 1 : days.length > 7 ? 1 : 0;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel title="Verificações por dia" hint="Cada barra soma as consultas feitas no dia.">
        {hasChecks ? (
          <ChartContainer config={statusConfig} className="aspect-auto h-56 w-full">
            <BarChart data={days} margin={{ left: -18, right: 4, top: 4 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={tick}
                interval={interval}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={tick}
                width={44}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="exists" stackId="s" fill="var(--color-exists)" />
              <Bar dataKey="notFound" stackId="s" fill="var(--color-notFound)" />
              <Bar dataKey="errors" stackId="s" fill="var(--color-errors)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <NoData />
        )}
      </Panel>

      <Panel title="Distribuição dos códigos" hint="Último resultado salvo de cada código.">
        {pie.length ? (
          <ChartContainer config={statusConfig} className="mx-auto aspect-auto h-56 w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="key" hideLabel />} />
              <Pie data={pie} dataKey="value" nameKey="key" innerRadius="55%" strokeWidth={2}>
                {pie.map((p) => (
                  <Cell key={p.key} fill={`var(--color-${p.key})`} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="key" />} />
            </PieChart>
          </ChartContainer>
        ) : (
          <NoData />
        )}
      </Panel>

      <Panel
        title="Taxa de sucesso por dia"
        hint="Consultas com resposta válida (200 ou 404) sobre o total do dia."
      >
        {hasChecks ? (
          <ChartContainer config={successConfig} className="aspect-auto h-48 w-full">
            <LineChart data={days} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={tick}
                interval={interval}
              />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={tick} width={44} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="success"
                type="monotone"
                stroke="var(--color-success)"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <NoData />
        )}
      </Panel>

      <Panel
        title="Tempo médio de resposta"
        hint="Do envio da consulta até a resposta, medido neste aparelho."
      >
        {hasLatency ? (
          <ChartContainer config={latencyConfig} className="aspect-auto h-48 w-full">
            <LineChart data={days} margin={{ left: -10, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={tick}
                interval={interval}
              />
              <YAxis tickLine={false} axisLine={false} tick={tick} width={52} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                dataKey="avgMs"
                type="monotone"
                stroke="var(--color-avgMs)"
                strokeWidth={2}
                dot={{ r: 2 }}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <NoData text="O tempo de resposta é medido nas próximas verificações." />
        )}
      </Panel>
    </div>
  );
}

function NoData({ text = "Sem verificações neste período." }: { text?: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-md border border-dashed text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
