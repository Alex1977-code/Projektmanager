export declare const PERMISSION_GROUPS: { group: string; items: [string, string][] }[];
export declare const ALL_PERMISSIONS: string[];
export declare const PERMISSION_LABEL: Record<string, string>;
export declare const DEFAULT_ROLES: { key: string; name: string; description: string; permissions: string[]; system: boolean }[];
export declare function permissionsFor(roleKey: string, roles: { key: string; permissions: string[] }[]): string[];
