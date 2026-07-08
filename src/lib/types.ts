// Core data model shared by the API route and the frontend.

// A user-configurable text column. System columns (timestamp, screenshot) are NOT ColumnDefs;
// they always exist and are kept out of `values` so a user column can never collide with them.
export interface ColumnDef {
  key: string; // unique slug used as the object key, e.g. "action"
  label: string; // display header, e.g. "Action"
  description: string; // guidance handed to Gemini for what to put in this column
}

export interface Step {
  values: Record<string, string>; // keyed by ColumnDef.key; one entry per configured column
  timestamp: string; // "MM:SS" as returned by Gemini
  timestampSeconds: number; // parsed whole seconds, for ffmpeg seek
  screenshot: string | null; // data URI (base64 JPEG); null until M3 fills it
}

export interface ProcessResult {
  steps: Step[];
  columns: ColumnDef[]; // the columns actually used, echoed back so the table self-describes
  videoName: string;
  model: string; // which model produced it (shown in the demo)
}

export interface ProcessError {
  error: string;
}
