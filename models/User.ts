import { UserData } from "./Interfaces";
import { GenerateUUID, HTTPResponse } from "../Utils";

export class User {
    static Create(data: UserData): User | Error {
        if(data.name.length < 3 || data.name.length > 32) {
            return Error("Name is an invalid length. Must be between 3 and 32 characters.");
        }

        if(data?.uuid) { 
            return Error("Expecting User DTO, got external ID in User Object Creation Flow.");
        }

        data.uuid = GenerateUUID();
        // save to db

        return new User(data);
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
                "status"        smallint NOT NULL DEFAULT 0,
                "hex"           varchar(6) NOT NULL DEFAULT "ffffff",
                "age"           timestamp NOT NULL DEFAULT NOW(),
                PRIMARY KEY ("uuid")
            );
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
            hex: 'ffffff',
            age: 0
        } as UserData;
    }
}