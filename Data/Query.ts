import { Client } from "pg";

import { HTTPResponse } from "../Utils";

export async function GetDBClient() {
    const DB = new Client();
    await DB.connect();
    return DB;
}

export class APIConnection {
    private DBConnection: Client;

    constructor() {
        this.Configure();
    }

    private async Configure() {
        this.DBConnection = await GetDBClient();
    }
}