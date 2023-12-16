import { Client, QueryResult } from "pg";

import { HTTPResponse } from "../Models/Interfaces";
import { sleep } from "../Utils";

export async function GetDBClient() {
    // Local Dev DB Connection Prefilled for Now - Safe to Push
    const DB = new Client({
        user: 'app',
        password: 'app',
        database: 'open-chat-local-dev'
    });
    await DB.connect();
    return DB;
}

export class APIConnection {
    private DBConnection: Client;

    connected = false;

    constructor() {
        this.Configure();
    }

    private async Configure() {
        this.DBConnection = await GetDBClient();
        this.connected = true;
    }

    public async Query(str: string, values: any[] = [], attempts = 0): Promise<QueryResult> {
        // Requires Error Handling and Change in Return Type
        // if(!this.connected || !this.DBConnection) { 
        //     await sleep(100); 
        //     return this.Query(str, values, attempts + 1) 
        // }

        return new Promise((res, rej) => {
            this.DBConnection.query(str, values, (err, result) => {
                if(err) { return rej(err); } res(result);
            });
        });
    }
}