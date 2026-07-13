export type JsonImportItem = {
  type: string;
  source_url?: string | null;
  source_notes?: string | null;
  overwrite?: boolean;
  [key: string]: unknown;
};

export type ImportFieldChange = { field: string; label: string; from?: unknown; to?: unknown; reason?: string };
export type ImportResultItem = {
  item_index?: number;
  type: string;
  target_name?: string;
  school?: string;
  district?: string;
  contact?: string;
  record_id?: string;
  school_record_id?: string;
  district_record_id?: string;
  contact_record_id?: string;
  task_record_id?: string;
  note_record_id?: string;
  status?: string;
  action?: string;
  source_url?: string | null;
  fields_changed?: ImportFieldChange[];
  fields_unchanged?: ImportFieldChange[];
  fields_skipped?: ImportFieldChange[];
  warnings?: string[];
  reason?: string;
  database_error?: unknown;
  suggested_fix?: string;
  message?: string;
};
export type ImportResultGroups = {
  ok?: boolean;
  applied: ImportResultItem[];
  updated: ImportResultItem[];
  created: ImportResultItem[];
  skipped: ImportResultItem[];
  unchanged: ImportResultItem[];
  failed: ImportResultItem[];
  warnings: ImportResultItem[];
  affected_record_ids?: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const roleCategories = [
  'principal','assistant_principal','counselor','career_counselor','cte','shop_teacher','automotive','welding','diesel','construction','agriculture','district_admin','superintendent','office','unknown',
] as const;

export const supportedItemTypes = [
  { type: 'school_update', label: 'Update a school', importable: true },
  { type: 'school_create', label: 'Create a missing school intentionally', importable: true },
  { type: 'district_update', label: 'Update a district', importable: true },
  { type: 'contact_create', label: 'Add a school or district contact', importable: true },
  { type: 'contact_update', label: 'Update an existing contact', importable: true },
  { type: 'school_note_create', label: 'Add a school note', importable: true },
  { type: 'task_create', label: 'Add a follow-up task', importable: true },
  { type: 'contact_log_create', label: 'Add a phone/email/contact log', importable: true },
  { type: 'school_program_update', label: 'Update school program notes', importable: true },
  { type: 'source_url_create', label: 'Add a source URL', importable: true },
  { type: 'feature_request_create', label: 'Send Aaron a feature request note', importable: false },
  { type: 'app_note_create', label: 'Send Aaron an app note', importable: false },
] as const;

export const supportedTypeNames = supportedItemTypes.map(item => item.type);
export function supportedType(type: string) { return supportedItemTypes.find(item => item.type === type); }

export function normalizeImport(raw: unknown): JsonImportItem[] {
  const maybeItems = Array.isArray(raw) ? raw : isRecord(raw) ? raw.items : undefined;
  if (!Array.isArray(maybeItems)) throw new Error('JSON import must be an array of items or an object with an items array.');
  return maybeItems.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Import item ${index + 1} must be an object.`);
    if (typeof item.type !== 'string' || item.type.trim().length === 0) throw new Error(`Import item ${index + 1} must include a string type.`);
    return { ...item, type: item.type.trim(), source_url: typeof item.source_url === 'string' ? item.source_url : item.source_url === null ? null : undefined, source_notes: typeof item.source_notes === 'string' ? item.source_notes : item.source_notes === null ? null : undefined, overwrite: typeof item.overwrite === 'boolean' ? item.overwrite : undefined };
  });
}

export const cleanExampleJson = {
  items: [
    { type: 'school_update', school_name: 'American Falls High School', district_name: 'American Falls School District #381', phone: '(208) 226-2531', website: 'https://www.sd381.k12.id.us/o/afhs', address: '2966 South Frontage Road', city: 'American Falls', state: 'ID', zip: '83211', fax: '(208) 226-5853', school_type: 'public', territory_status: 'included', source_url: 'https://www.sd381.k12.id.us/o/afhs', overwrite: false },
    { type: 'school_create', school_name: 'Skyline Senior High School', district_name: 'Idaho Falls School District 91', county: 'Bonneville', state: 'ID', city: 'Idaho Falls', address: '1767 Blue Sky Drive, Idaho Falls, ID 83402', phone: '(208) 525-7770', website: 'https://shs.ifschools.org/', source_url: 'https://shs.ifschools.org/', source_notes: 'Official school site and NCES.', overwrite: false },
    { type: 'district_update', district_name: 'American Falls School District #381', phone: '208-226-5173', website: 'https://www.sd381.k12.id.us/', address: '827 Fort Hall', city: 'American Falls', state: 'ID', zip: '83211', source_url: 'https://www.sd381.k12.id.us/', overwrite: false },
    { type: 'contact_create', school_name: 'Example High School', contact_name: 'Jane Smith', title: 'Counselor', role_category: 'counselor', email: '', phone: '', source_url: 'https://example.edu/staff', source_notes: 'Copied from staff directory.', confidence: 'medium' },
    { type: 'school_note_create', school_name: 'American Falls High School', note_type: 'program', note: 'Career Day article may indicate recruiting timing.', source_url: 'https://www.sd381.k12.id.us/o/afhs' },
    { type: 'task_create', title: 'Find principal, counselor, and CTE/shop contacts', school_name: 'American Falls High School', priority: 'high', status: 'not_started', description: 'Staff contacts are still missing.', source_url: 'https://www.sd381.k12.id.us/o/afhs' },
  ],
};
export const schemaExample = cleanExampleJson;

export const schoolCreateAllowedFields = [
  'type','school_name','district_name','county','state','city','phone','website','address','source_url','source_notes','school_type','territory_status','fax','special_programs','program_notes','cte_programs','shop_programs','trades_programs','career_programs','school_profile_notes','bell_schedule','bell_schedule_url','student_population_total','grade_enrollment','enrollment_source_url','enrollment_notes','overwrite','zip','district_id','school_id','nces_id','verification_status','create_if_missing',
] as const;
export const schoolUpdateAllowedFields = [...schoolCreateAllowedFields, 'recruiting_priority','relationship_status','enrollment','mascot','graduation_date'] as const;

export function validationMessagesForItem(item: JsonImportItem) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!supportedType(item.type)) errors.push(`Unsupported item type: ${item.type}`);
  const allowed = item.type === 'school_create' ? schoolCreateAllowedFields : item.type === 'school_update' ? schoolUpdateAllowedFields : null;
  if (allowed) {
    const allowedSet = new Set<string>(allowed);
    for (const field of Object.keys(item)) if (!allowedSet.has(field)) warnings.push(`Unknown field ignored: ${field}`);
  }
  if (item.type === 'school_create') {
    for (const field of ['school_name','district_name','county','state']) if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`Missing required field for school_create: ${field}`);
    if (![item.city, item.address, item.website, item.source_url].some(value => typeof value === 'string' && value.trim())) errors.push('school_create requires at least one of city, address, website, or source_url');
  }
  return { errors, warnings };
}
