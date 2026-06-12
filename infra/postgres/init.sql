CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL,
  category TEXT NOT NULL,
  region TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant_created
  ON orders (tenant_id, created_at);

INSERT INTO orders (tenant_id, status, category, region, amount, created_at)
SELECT
  CASE WHEN n % 3 = 0 THEN 'tenant-b' ELSE 'tenant-a' END,
  (ARRAY['已完成', '处理中', '已取消'])[1 + (n % 3)],
  (ARRAY['软件', '硬件', '服务', '耗材'])[1 + (n % 4)],
  (ARRAY['华东', '华南', '华北', '西南'])[1 + (n % 4)],
  500 + ((n * 137) % 8000),
  CURRENT_DATE - INTERVAL '120 days' + (n || ' days')::interval
FROM generate_series(1, 120) AS n;
