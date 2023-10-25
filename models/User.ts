import { UserData } from "./Interfaces";
import { HTTPResponse } from "../Utils";

export class User {
    static Create(data: UserData): User | Error {
        // Will Error Handle User Creation
        return Error();
    }

    static async FormValidation(data: UserData): Promise<User | HTTPResponse> {
        // Pass through for user creation forms
        return { okay: false, code: 500 }
    }

    static DBTableFormat = () => {
        return `
            CREATE TABLE IF NOT EXISTS "users" (
                "uuid"          uuid NOT NULL,
                "name"          varchar(32) NOT NULL,
                "
            )
        `;
    }

    private data: UserData;

    constructor(data: UserData) { this.data = data; }

    getID() { return this.data.uuid; }

    toJSON() {
        return {
            uuid: '',
            name: '',
            status: 0,
            auth: [],
            subs: [],
            roles: [],
            hex: '#ffffff',
            age: 0
        } as UserData;
    }
}