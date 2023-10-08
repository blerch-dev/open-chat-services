// UUID
import { v4 } from 'uuid';
export function GenerateUUID() { return v4(); }
export function ValidUUID(uuid: string) { return uuid.length === 36 }

// Time
export enum TimeValues {
    Second = 1000,
    Minute = TimeValues.Second * 60,
    Hour = TimeValues.Minute * 60,
    Day = TimeValues.Hour * 24,
    Week = TimeValues.Day * 7,
    Month = TimeValues.Day * 30, // 30 for simplicity
    Year = TimeValues.Day * 365
}

// Network Responses
export type HTTPResponse = {
    okay: boolean,
    code: number,
    message?: string,
    data?: unknown
}
