export type JsonImportItem = {
  type: string;
  source_url?: string | null;
  source_notes?: string | null;
  overwrite?: boolean;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeImport(raw: unknown): JsonImportItem[] {
  const maybeItems = Array.isArray(raw) ? raw : isRecord(raw) ? raw.items : undefined;

  if (!Array.isArray(maybeItems)) {
    throw new Error('JSON import must be an array of items or an object with an items array.');
  }

  return maybeItems.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`Import item ${index + 1} must be an object.`);
    }

    if (typeof item.type !== 'string' || item.type.trim().length === 0) {
      throw new Error(`Import item ${index + 1} must include a string type.`);
    }

    return {
      ...item,
      type: item.type,
      source_url: typeof item.source_url === 'string' ? item.source_url : item.source_url === null ? null : undefined,
      source_notes: typeof item.source_notes === 'string' ? item.source_notes : item.source_notes === null ? null : undefined,
      overwrite: typeof item.overwrite === 'boolean' ? item.overwrite : undefined,
    };
  });
}

export const schemaExample = {
  items: [
    {
      type: 'contact_create',
      school_name: 'Example High School',
      name: '',
      title: '',
      email: '',
      phone: '',
      source_url: '',
      source_notes: '',
      overwrite: false,
    },
    {
      type: 'task_create',
      title: 'Call Boise High next week',
      priority: 'high',
      due_date: '',
      school_name: 'Boise High School',
    },
    {
      type: 'contact_log_create',
      school_name: 'Boise High School',
      contact_method: 'phone',
      outcome: 'needs_follow_up',
      notes: 'Talked to counselor; call back in September.',
      contacted_at: '',
    },
    {
      type: 'school_update',
      school_name: 'Example High School',
      phone: '',
      website: '',
      enrollment: null,
      mascot: '',
      graduation_date: '',
      bell_schedule_url: '',
      fafsa_or_career_event_notes: '',
      best_time_to_visit_seniors: '',
      special_programs: '',
      program_notes: '',
      overwrite: false,
    },
  ],
};
