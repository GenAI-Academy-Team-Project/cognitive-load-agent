import type { CareEvent, MemoryRecord } from './types';

export type AttentionSettings = {
  daily_minutes: number;
  digest_hour: number;
  focus_mode: boolean;
};
export type CarePreference = {
  memory_id: string;
  memory_value: string;
  start_hour: number;
  end_hour: number;
};
export type CareRoutine = {
  id: string;
  title: string;
  category: string;
  every_days: number;
  next_at: string;
  updated_at: string;
};
export type AppointmentNotes = {
  task_id: string;
  questions: string;
  follow_up: string;
};
export type AnticipationState = {
  settings: AttentionSettings;
  preference: CarePreference | null;
  preferenceNeedsReview: boolean;
  verifiedMemories: MemoryRecord[];
  routines: CareRoutine[];
  notes: AppointmentNotes[];
  events: CareEvent[];
  generatedKeys: string[];
};
export type GeneratedBatch = {
  key: string;
  routineId?: string;
  revision?: string;
  nextAt?: string;
};
