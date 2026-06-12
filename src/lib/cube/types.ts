export const FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "notStartsWith",
  "endsWith",
  "notEndsWith",
  "gt",
  "gte",
  "lt",
  "lte",
  "set",
  "notSet",
  "inDateRange",
  "notInDateRange",
  "beforeDate",
  "afterDate",
] as const;

export const TIME_GRANULARITIES = [
  "second",
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
] as const;

export type FilterOperator = (typeof FILTER_OPERATORS)[number];
export type TimeGranularity = (typeof TIME_GRANULARITIES)[number];

export interface CubeFilter {
  member: string;
  operator: FilterOperator;
  values?: string[];
}

export interface CubeTimeDimension {
  dimension: string;
  granularity?: TimeGranularity;
  dateRange?: string | [string, string];
}

export interface CubeQuery {
  measures: string[];
  dimensions?: string[];
  timeDimensions?: CubeTimeDimension[];
  filters?: CubeFilter[];
  order?: Record<string, "asc" | "desc">;
  limit?: number;
  offset?: number;
  timezone?: string;
}

export interface CubeMember {
  name: string;
  title: string;
  shortTitle: string;
  type: string;
}

export interface PublicCube {
  name: string;
  title: string;
  measures: CubeMember[];
  dimensions: CubeMember[];
}

export interface PublicMeta {
  cubes: PublicCube[];
}

export interface CubeLoadResponse {
  data?: Array<Record<string, string | number | null>>;
  annotation?: Record<string, unknown>;
  error?: string;
}
