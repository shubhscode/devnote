import { isTauri, invoke } from './mirror';

export interface GitStatusDto {
  hasGit: boolean;
  hasRepo: boolean;
  raw: string;
}

export interface GitOpResult {
  ok: boolean;
  conflict: boolean;
  message: string;
}

export interface ConflictStages {
  base: string;
  ours: string;
  theirs: string;
}

export function gitAvailable(): Promise<boolean> {
  return invoke<boolean>('git_available');
}

export function gitStatusRaw(): Promise<GitStatusDto> {
  return invoke<GitStatusDto>('git_status_raw');
}

export function gitInit(): Promise<void> {
  return invoke<void>('git_init');
}

export function gitGetRemote(): Promise<string | null> {
  return invoke<string | null>('git_get_remote');
}

export function gitSetRemote(url: string): Promise<void> {
  return invoke<void>('git_set_remote', { url });
}

export function gitCommitAll(message: string): Promise<boolean> {
  return invoke<boolean>('git_commit_all', { message });
}

export function gitPull(): Promise<GitOpResult> {
  return invoke<GitOpResult>('git_pull');
}

export function gitPush(): Promise<GitOpResult> {
  return invoke<GitOpResult>('git_push');
}

export function gitConflictStages(path: string): Promise<ConflictStages> {
  return invoke<ConflictStages>('git_conflict_stages', { path });
}

export function gitAdd(paths: string[]): Promise<void> {
  return invoke<void>('git_add', { paths });
}

export function gitFinishMerge(message: string): Promise<boolean> {
  return invoke<boolean>('git_finish_merge', { message });
}

export function gitAbortMerge(): Promise<void> {
  return invoke<void>('git_abort_merge');
}

export function gitDeviceName(): Promise<string> {
  return invoke<string>('git_device_name');
}

export interface BackupInfo {
  path: string;
  files: number;
}

export function backupZip(): Promise<BackupInfo> {
  return invoke<BackupInfo>('backup_zip');
}

export function restoreZip(zipPath: string): Promise<number> {
  return invoke<number>('restore_zip', { zipPath });
}

/**
 * Native .zip picker (desktop only). Null when cancelled — or when running
 * in a plain browser, where no native picker exists.
 */
export async function pickBackupFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Backup', extensions: ['zip'] }],
  });
  return typeof picked === 'string' ? picked : null;
}
