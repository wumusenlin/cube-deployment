import { z } from "zod";

import { FILTER_OPERATORS, TIME_GRANULARITIES } from "./types";

const filterSchema = z.object({
  member: z.string().min(1),
  operator: z.enum(FILTER_OPERATORS),
  values: z.array(z.string()).max(50).optional(),
});

const timeDimensionSchema = z.object({
  dimension: z.string().min(1),
  granularity: z.enum(TIME_GRANULARITIES).optional(),
  dateRange: z
    .union([z.string().min(1), z.tuple([z.string().min(1), z.string().min(1)])])
    .optional(),
});

export const cubeQuerySchema = z.object({
  measures: z.array(z.string().min(1)).min(1).max(3),
  dimensions: z.array(z.string().min(1)).max(6).optional(),
  timeDimensions: z.array(timeDimensionSchema).max(1).optional(),
  filters: z.array(filterSchema).max(8).optional(),
  order: z.record(z.string(), z.enum(["asc", "desc"])).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).max(10_000).optional(),
  timezone: z.string().max(64).optional(),
});

const tableColumnSchema = z.object({
  member: z.string().min(1),
  title: z.string().min(1).max(40),
  format: z
    .enum(["text", "number", "currency", "date", "datetime"])
    .default("text"),
});

export const chartProtocolSchema = z.object({
  type: z.enum(["bar", "line", "area", "pie", "kpi", "table"]),
  title: z.string().min(1).max(80),
  category: z.string().optional(),
  value: z.string().min(1),
  series: z.string().optional(),
  valueFormat: z.enum(["number", "currency", "percent"]).default("number"),
  columns: z.array(tableColumnSchema).min(1).max(12).optional(),
});

export const queryRequestSchema = z.object({
  query: cubeQuerySchema,
  chart: chartProtocolSchema.optional(),
});

export const llmRequestSchema = z.object({
  prompt: z.string().trim().min(2).max(500),
});

export type ChartProtocol = z.infer<typeof chartProtocolSchema>;
