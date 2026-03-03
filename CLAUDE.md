# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**跃海运价/船期资料智能导入系统** — An AI-powered freight rate and shipping schedule document import system for freight forwarding companies. Uploaded documents (PDF, image, DOCX) are processed by Claude AI to extract structured data into Excel templates.

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

No test framework is configured. Use `USE_MOCK=true` in `.env.local` for local development without Supabase/Anthropic API keys.

## Environment Setup

Copy `.env.local.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase project credentials
- `ANTHROPIC_API_KEY` — Claude API key
- `USE_MOCK=true` — enables in-memory mock mode (no external services needed)

## Architecture

**Stack**: Next.js 16 (App Router) + TypeScript + Supabase (PostgreSQL + Storage) + Claude AI (`claude-sonnet-4-6`)

### Data Flow

```
Upload files → POST /api/tasks (create task + store files in Supabase Storage)
                    ↓
POST /api/tasks/[id]/process (AI extraction pipeline):
  1. Download files from Supabase Storage
  2. Parse: pdf-parse (PDF text), mammoth (DOCX), Buffer (images/PDFs for vision)
  3. Send to Claude with template columns → get JSON rows with risk levels
  4. Save to extracted_cells table → task status = "review"
                    ↓
User reviews/edits cells → PATCH /api/tasks/[id]/cells
                    ↓
POST /api/download/[id] → generate Excel via exceljs → upload to Storage → task status = "done"
```

### Key Directories

- `app/api/` — All backend API routes (Next.js App Router)
- `lib/` — Core logic: `ai-extract.ts` (Claude API), `excel-gen.ts`, `parse-pdf.ts`, `parse-docx.ts`, `supabase-server.ts` (service role), `mock-store.ts` (in-memory mock)
- `types/index.ts` — All shared TypeScript types (`Task`, `Template`, `ExtractedCell`, `RiskLevel`, etc.)
- `components/ui/` — shadcn/ui components (do not modify directly)

### Database Schema

Four tables in Supabase (see `supabase/schema.sql`):
- `templates` — route templates with `columns: string[]` defining Excel header fields
- `tasks` — status (`processing` | `review` | `done` | `failed`), risk counts
- `source_files` — uploaded files associated with a task
- `extracted_cells` — per-cell extraction results with `risk_level` (`none` | `yellow` | `red`), `confidence`, `is_manually_edited`

Three storage buckets: `source-files/`, `templates/`, `output-files/`

### AI Extraction (`lib/ai-extract.ts`)

- Model: `claude-sonnet-4-6` with `max_tokens: 4096`
- PDFs sent as native `document` blocks (Claude's PDF understanding beta)
- Images sent as `image` base64 blocks (vision)
- DOCX parsed to text via mammoth, sent as `text` blocks
- Required fields: `起运港`, `目的港`, `开航日`, `截关日` — missing → `risk_level: "red"`
- Conflicting values across files → `risk_level: "red"` with note
- Confidence < 0.8 → `risk_level: "yellow"`
- Claude must return pure JSON; the parser handles JSON wrapped in markdown code blocks

### Mock Mode (`lib/mock-store.ts`)

When `USE_MOCK=true`, all API routes use in-memory storage instead of Supabase. The mock store is a singleton with maps for tasks, files, cells, and templates. Useful for UI development without credentials.

### Important Config Notes

- `next.config.ts`: `pdf-parse` and `canvas` are in `serverExternalPackages` (native module deps)
- Server actions body limit: 50MB (for large file uploads)
- Path alias `@/*` maps to project root
