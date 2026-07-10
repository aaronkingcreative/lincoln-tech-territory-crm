import { createServiceClient } from '../lib/supabase';
export const CONTACT_KEYWORDS = ['principal','assistant principal','counselor','head counselor','college and career','career center','cte director','cte coordinator','automotive','welding','construction','diesel','manufacturing','engineering','robotics','machining','woodworking','industrial technology','shop teacher'];
export const db = () => createServiceClient();
