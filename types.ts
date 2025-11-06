
// FIX: Removed circular import `import { TaskStatus } from './types';` which caused declaration conflicts.
export enum TaskStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PENDING = 'pending',
}

export interface TaskDetails {
  id: string;
  createdAt: string;
  status: TaskStatus;
  start_time?: string;
  end_time?: string;
  processing_time_seconds?: number;
  final_video_duration_seconds?: number;
  final_video_size_bytes?: number;
  final_video_path?: string;
  error?: string;
}

export interface StoredTask {
    id: string;
    createdAt: string;
}