// UUID
import { v4 } from 'uuid';
export function GenerateUUID() { return v4(); }
export function ValidUUID(uuid: string) { return uuid?.length === 36 }

import { randomBytes } from 'crypto';
export function GenerateID(bytes = 4) { return randomBytes(bytes).toString('hex'); }

export function GenerateName(length = 8) { return (Math.random() + 1).toString(36).substring(length); }

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

// Sleep
export function sleep(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

export function padLeft(num: number, length = 2) {
    return ('0000' + num).slice(-1 * length);
}

import { ServerErrorType } from '../Models/Enums';
import { HTTPResponse } from '../Models/Interfaces';
export class ServerError {
    private code: number;
    private args: any[];

    constructor(code = 0, ...args: any[]) {
        // super(...args);

        this.code = code;
        this.args = args;
    }

    getStatus() { return this.code; }

    getMessage() { return this.args[0] as string ?? ""; }

    getAsHTTPResponse() { return { okay: false, code: this.code, message: this.args?.[0] } as HTTPResponse }

    toJSON() {
        let options = typeof(this.args[1] !== 'string') ? this.args[1] : undefined;

        return {
            code: ServerErrorType[this.code],
            message: this.args[0] ?? undefined,
            options: options,
            fileName: options === undefined ? this.args[1] : undefined,
            lineNumber: this.args[2] ?? undefined
        }
    }
}

export const ts = (val) => { return new Date(val).toISOString(); }