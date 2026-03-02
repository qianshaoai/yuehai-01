export type TaskStatus = 'processing' | 'review' | 'done' | 'failed'
export type RiskLevel = 'none' | 'yellow' | 'red'
export type FileType = 'pdf' | 'image' | 'docx'
export type TemplateVersion = 'current' | 'previous'

export interface Template {
  id: string
  route_name: string
  template_file_url: string
  sheet_name: string
  header_row_index: number
  columns: string[]
  version: TemplateVersion
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  template_id: string
  template?: Template
  status: TaskStatus
  risk_count_red: number
  risk_count_yellow: number
  output_file_url?: string
  created_at: string
  updated_at: string
}

export interface SourceFile {
  id: string
  task_id: string
  file_name: string
  file_type: FileType
  file_url: string
  page_count?: number
  created_at: string
}

export interface ExtractedCell {
  id: string
  task_id: string
  row_index: number
  column_key: string
  value: string
  risk_level: RiskLevel
  confidence?: number
  is_manually_edited: boolean
  note?: string
  created_at: string
  updated_at: string
}
