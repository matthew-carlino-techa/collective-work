export type AccountStatusFlag = "yes" | "no" | "pending";

export type CollectiveAccount = {
  id: number;
  owner_name: string;
  username: string;
  email: string;
  password: string;
  github_fs_repo: string;
  github_bc_repo: string;
  github_pat: string;
  proxy_ip: string;
  proxy_port: string;
  proxy_user: string;
  proxy_pass: string;
  search_brief: string;
  /** Cap of DMs this account may send per UTC day */
  dm_per_day: number;
  /** Cap of DMs this account may send per rolling hour */
  dm_per_hour: number;
  /** Sends in the current hour window for this account */
  dm_hour_batch: number;
  dm_hour_started_at: string;
  dm_quota_day: string;
  today_count: number;
  start_status: AccountStatusFlag;
  contact_status: AccountStatusFlag;
  online_status: AccountStatusFlag;
  error_message: string;
  bot_config_json?: string;
  created_at: string;
  updated_at: string;
};

export type AccountInput = {
  owner_name: string;
  username: string;
  email: string;
  password?: string;
  github_fs_repo?: string;
  github_bc_repo?: string;
  github_pat?: string;
  proxy_ip?: string;
  proxy_port?: string;
  proxy_user?: string;
  proxy_pass?: string;
  search_brief?: string;
  dm_per_day?: number;
  dm_per_hour?: number;
};

export type PipelineLead = {
  id: number;
  platform: string;
  seller_username: string;
  display_name: string;
  track: "fullstack" | "blockchain";
  step: string;
  status: string;
  replies: number;
  wait_label: string;
  last_activity: string;
  github_url: string;
  email: string;
  linkedin_url: string;
  /** Collective profile slug only (`taha-djemili`). Dashboard builds the full URL. */
  profile_id: string;
  /** Full Collective profile URL. Filled by the pipeline API, not stored. */
  profile_url?: string;
  /** Operator marked as following on LinkedIn */
  following: number;
  /** Operator double-checked the profile */
  double_checked: number;
  assigned_account_id: number | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowStep = {
  id: number;
  track: "fullstack" | "blockchain";
  step_key: string;
  step_label: string;
  subtitle: string;
  body: string;
  sort_order: number;
  updated_at: string;
};

export type DmLimits = {
  dm_per_day: number;
  dm_per_hour: number;
  today_sent: number;
  hour_batch: number;
};

export type OutreachSettings = {
  search_brief: string;
};

export type OutreachLogRow = {
  id: number;
  account_id: number | null;
  seller_key: string;
  seller_name: string;
  action: string;
  detail: string;
  created_at: string;
};

// Re-export bot config types for convenience
export type { AccountBotConfig, BotFieldKey } from "./bot-config";
