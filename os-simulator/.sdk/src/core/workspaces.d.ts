declare const workspaceIdBrand: unique symbol;
export type WorkspaceId = string & {
    readonly [workspaceIdBrand]: true;
};
export declare const WORKSPACE_ID_PATTERN: RegExp;
export interface WorkspaceRecord {
    version: 1;
    id: WorkspaceId;
    pluginId: string;
    modeId: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}
export interface WorkspaceIndex {
    version: 1;
    workspaceIds: WorkspaceId[];
}
export type WorkspaceDirectoryIssue = {
    kind: "missing-record";
    id: WorkspaceId;
} | {
    kind: "invalid-record";
    id: WorkspaceId;
} | {
    kind: "unreadable-record";
    id: WorkspaceId;
};
export interface WorkspaceDirectory {
    workspaces: WorkspaceRecord[];
    issues: WorkspaceDirectoryIssue[];
}
export interface WorkspaceDeletionJournalEntry {
    workspaceId: WorkspaceId;
    pluginId: string;
    stage: "started" | "state-deleted" | "metadata-deleted";
    startedAt: string;
}
export declare class DeletionJournalError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
export declare class DeletionJournalCorruptError extends DeletionJournalError {
    constructor(message?: string, options?: {
        cause?: unknown;
    });
}
export declare class DeletionJournalUnreadableError extends DeletionJournalError {
    constructor(message?: string, options?: {
        cause?: unknown;
    });
}
export interface WorkspaceReconciliation {
    orphanIds: WorkspaceId[];
    missingIds: WorkspaceId[];
    invalidOrphanIds: WorkspaceId[];
    invalidRecordIds: WorkspaceId[];
    unreadableRecordIds: WorkspaceId[];
    interruptedDeletionIds?: WorkspaceId[];
    deletionJournalIssue?: "corrupt" | "unreadable";
}
export type WorkspaceAvailability = "available" | "plugin-disabled" | "plugin-missing" | "mode-missing";
export interface WorkspacePluginSnapshot {
    id: string;
    enabled: boolean;
    modeIds: readonly string[];
}
export declare function isWorkspaceId(value: unknown): value is WorkspaceId;
export declare function parseWorkspaceId(value: unknown): WorkspaceId;
export declare function parseWorkspaceTitle(value: unknown): string;
export declare function parseWorkspaceRecord(value: unknown): WorkspaceRecord;
export declare function parseWorkspaceIndex(value: unknown): WorkspaceIndex;
export declare function emptyWorkspaceIndex(): WorkspaceIndex;
export declare function resolveWorkspaceAvailability(workspace: WorkspaceRecord, plugins: readonly WorkspacePluginSnapshot[]): WorkspaceAvailability;
export {};
