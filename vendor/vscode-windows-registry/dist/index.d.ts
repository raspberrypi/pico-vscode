export type HKEY = "HKEY_CURRENT_USER" | "HKEY_LOCAL_MACHINE" | "HKEY_CLASSES_ROOT" | "HKEY_USERS" | "HKEY_CURRENT_CONFIG";
export declare function EnumRegKeyKeys(hive: HKEY, path: string): string[];
export declare function EnumRegKeyValues(hive: HKEY, path: string): string[];
export declare function GetStringRegKey(hive: HKEY, path: string, name: string): string | undefined;
export declare function SetStringRegKey(hive: HKEY, path: string, name: string, value: string): void;
export declare function DeleteRegKeyKey(hive: HKEY, path: string, name: string): void;
export declare function DeleteRegKeyValue(hive: HKEY, path: string, name: string): void;
