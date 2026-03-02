-- ============================================================
-- 跃海运价助手 — Supabase 数据库 Schema
-- 在 Supabase Dashboard > SQL Editor 中执行此文件
-- ============================================================

-- 1. 模板表
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  route_name text not null,
  template_file_url text not null,
  sheet_name text not null default 'Sheet1',
  header_row_index integer not null default 1,
  columns jsonb not null default '[]',
  version text not null default 'current' check (version in ('current', 'previous')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. 任务表
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates(id) on delete restrict,
  status text not null default 'processing' check (status in ('processing', 'review', 'done', 'failed')),
  risk_count_red integer not null default 0,
  risk_count_yellow integer not null default 0,
  error_message text,
  output_file_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. 原始文件表
create table if not exists source_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('pdf', 'image', 'docx')),
  file_url text not null,
  page_count integer,
  created_at timestamptz not null default now()
);

-- 4. 提取结果表（按行-列存储）
create table if not exists extracted_cells (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  row_index integer not null,
  column_key text not null,
  value text not null default '',
  risk_level text not null default 'none' check (risk_level in ('none', 'yellow', 'red')),
  confidence float default 1.0,
  is_manually_edited boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id, row_index, column_key)
);

-- ============================================================
-- 索引（提高查询性能）
-- ============================================================
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_created_at on tasks(created_at desc);
create index if not exists idx_source_files_task_id on source_files(task_id);
create index if not exists idx_extracted_cells_task_id on extracted_cells(task_id);
create index if not exists idx_extracted_cells_task_row on extracted_cells(task_id, row_index);

-- ============================================================
-- Storage Buckets（在 Supabase Dashboard > Storage 中手动创建）
-- ============================================================
-- Bucket 1: "source-files"  (私有) — 存储用户上传的原始材料
-- Bucket 2: "templates"     (私有) — 存储模板 Excel 文件
-- Bucket 3: "output-files"  (私有) — 存储生成的 Excel 文件

-- ============================================================
-- RLS 策略（内部工具，暂时关闭 RLS，后续可按需开启）
-- ============================================================
alter table templates disable row level security;
alter table tasks disable row level security;
alter table source_files disable row level security;
alter table extracted_cells disable row level security;
