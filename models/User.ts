import { UserData } from "./Interfaces";
import { HTTPResponse } from "./Utils";

export class User {
    static Create(data: UserData): User | Error {
        // Will Error Handle User Creation
        return Error();
    }

    static async FormValidation(data: UserData): Promise<User | HTTPResponse> {
        // Pass through for user creation forms
        return { okay: false, code: 500 }
    }

    private data: UserData;

    constructor(data: UserData) { this.data = data; }

    toJSON() {
        return {
            uuid: '',
            name: '',
            role: 0,
            auth: [],
            subs: [],
            hex: '',
            age: 0
        } as UserData;
    }
}