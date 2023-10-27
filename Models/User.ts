import { Router } from "express";
import { QueryResult } from "pg";

import { Model, UserData } from "./Interfaces";
import { DatabaseResponse, GenerateUUID, HTTPResponse, ValidUUID } from "../Utils";

export class User implements Model {
    // #region User Creation
    static CreateFromData(data: UserData): User | Error {
        if(data.name.length < 3 || data.name.length > 32) {
            return Error("Name is an invalid length. Must be between 3 and 32 characters.");
        }

        if(!ValidUUID(data?.uuid)) { return Error("Invalid UUID given."); }

        data.uuid = GenerateUUID();
        return new User(data);
    }

    // Same as CreateFromData, but Returns HTTP Formatted Response
    static async FormValidation(data: UserData): Promise<User | HTTPResponse> {
        if(data?.uuid) { 
            return { okay: false, code: 422, message: "Expecting User Creation Form Data, got external ID in User Object Creation Flow."}
        }

        let user = User.CreateFromData(data);
        if(user instanceof User) {
            return user;
        } else {
            return { okay: false, code: 422, message: user.message }
        }
    }
    // #endregion
    
    // #region DB and API
    // User Subscriptions TBD
    static DBTableFormat = (drop: boolean = false) => {
        return `
            ${drop === true ? 'DROP TABLE IF EXISTS "users";' : ''}
            CREATE TABLE IF NOT EXISTS "users" (
                "uuid"          uuid NOT NULL UNIQUE,
                "name"          varchar(32) NOT NULL UNIQUE,
                "status"        smallint NOT NULL DEFAULT 0,
                "hex"           varchar(6) NOT NULL DEFAULT 'ffffff',
                "age"           timestamp NOT NULL DEFAULT NOW(),
                "last"          timestamp NOT NULL DEFAULT NOW(),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_twitch_connection";' : ''}
            CREATE TABLE IF NOT EXISTS "user_twitch" (
                "uuid"          uuid NOT NULL UNIQUE,
                "twitch_id"     varchar(64) UNIQUE,
                "twitch_name"   varchar(32),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_youtube_connection";' : ''}
            CREATE TABLE IF NOT EXISTS "user_twitch" (
                "uuid"          uuid NOT NULL UNIQUE,
                "youtube_id"    varchar(64) UNIQUE,
                "youtube_name"  varchar(32),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_discord_connection";' : ''}
            CREATE TABLE IF NOT EXISTS "user_twitch" (
                "uuid"          uuid NOT NULL UNIQUE,
                "discord_id"    varchar(64) UNIQUE,
                "discord_name"  varchar(32),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_subscriptions";' : ''}
            CREATE TABLE IF NOT EXISTS "user_subscriptions" (
                "uuid"          uuid NOT NULL,
                "channel_id"    varchar(32) NOT NULL,
                "info"          varchar(32) NOT NULL,
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_channels";' : ''}
            CREATE TABLE IF NOT EXISTS "user_channels" (
                "uuid"          uuid NOT NULL,
                "channel_id"    varchar(32) NOT NULL,
                "role"          bigint NOT NULL DEFAULT 0,
                PRIMARY KEY ("uuid")
            );
            
            ${drop === true ? 'DROP TABLE IF EXISTS "user_session_tokens";' : ''}
            CREATE TABLE IF NOT EXISTS "user_session_tokens" (
                "uuid"                  uuid NOT NULL UNIQUE,
                "selector"              varchar(12) NOT NULL UNIQUE,
                "hashed_validator"      varchar(128) NOT NULL,
                "salt_code"             varchar(8) NOT NULL,
                "expires"               timestamp NOT NULL,
                PRIMARY KEY ("selector")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_access_tokens";' : ''}
            CREATE TABLE IF NOT EXISTS "user_access_tokens" (
                "uuid"                  uuid NOT NULL UNIQUE,
                "hashed_access_token"   varchar(128) NOT NULL,
                "salt_code"             varchar(8) NOT NULL,
                "expires"               TIMESTAMP NOT NULL,
                "token_level"           smallint DEFAULT 0,
                PRIMARY KEY ("uuid")
            );
        `;
    }    

    static getAPIRouter(callback: (str: string, val: any[]) => Promise<QueryResult>, dev: boolean = false) {
        const route = Router();

        route.get('/me', async (req, res, next) => {
            // If Session, Fetch From DB, Refresh Session with Data, Return Data
            console.log("User Session:", req.session.user);
            if(req.session.user) {
                // Refresh from DB
                let result = await callback('SELECT * FROM users WHERE uuid = $1', [req.session.user.uuid]);
                if(result.rowCount !== 1) { 
                    return res.json({ error: { code: 500, message: "Invalid user database results." } } as DatabaseResponse); 
                }

                // Create User from DB Read
                let user = User.CreateFromData(result.rows[0]);
                if(user instanceof Error) { 
                    return res.json({ error: { code: 500, message: "Issue creating user from stored data." } } as DatabaseResponse); 
                }

                // Update Session and Return User Data
                req.session.user = (user as User).toJSON();
                return res.json({ results: [(user as User).toJSON()] } as DatabaseResponse);
            }

            return res.json({ error: { code: 401, message: "No User Session Data" } } as DatabaseResponse);
        });

        route.get('/id/:id', async (req, res, next) => {
            let result = await callback('SELECT * FROM users WHERE uuid = $1', [req.params.id]);
            return res.json({ results: result.rows, meta: {} } as DatabaseResponse);
        });

        route.get('/search/:search', async (req, res, next) => {
            let result = await callback('SELECT * FROM users WHERE uuid::text LIKE $1 OR name ILIKE $1', [req.params.search]);
            return res.json({ results: result.rows, meta: {} } as DatabaseResponse);
        });
        
        route.post('/create', async (req, res, next) => {
            // Parses Form Body
            let result = await User.FormValidation(req.body);
            if(result instanceof User) {
                // Insert User into DB
                let userCreation = await result.DBInsertSafe(async (str: string, val: any[]) => {
                    let result = await callback(str, val);
                    return { results: result.rows, meta: {} } as DatabaseResponse
                });
                
                // Dev Logging for Bug Fixing
                if(result === userCreation && dev === true) { console.log("User Created and Inserted:", userCreation); }
                else if(dev === true) { console.log("Issue Inserting User:", userCreation); }

                // Handle Insert Results
                if(userCreation instanceof User) {
                    // Sets Session For Client
                    req.session.user = userCreation.toJSON();
                    return res.json(userCreation.toJSON());
                } else {
                    return res.status(userCreation.error?.code).json(userCreation);
                }
            } else {
                // Handle Error
                return res.status(result.code).json(result);
            }
        });

        return route;
    }

    async DBInsertSafe(callback: (str: string, val: any[]) => Promise<DatabaseResponse>, dev: boolean = false) {
        // Check if Name/UUID is Unique
        let result = await callback(`SELECT 1 FROM users WHERE uuid = $1 OR LOWER(name) = $2`, [this.data.uuid, this.data.name.toLowerCase()]);
        if(dev === true) { console.log("Check for Uniques:", result); }

        // Handle Error for Uniques
        if(result.error) { if(dev === true) { console.log("Error::", result.error); } return result; }
        else if(result.results.length > 0) { 
            if(dev === true) { console.log("Not Unique"); } 
            return { error: { code: 422, message: "Invalid UUID or Username." } } as DatabaseResponse; 
        }

        // Insert User
        const ts = (val) => { return new Date(val).toISOString(); }
        result = await callback(
            'INSERT INTO users (uuid, name, status, hex, age, last) VALUES ($1, $2, $3, $4, $5, $6)',
            [this.data.uuid, this.data.name, this.data.status, this.data.hex, ts(this.data.age), ts(this.data.last)]
        );

        // Insert to Associated Tables - TODO

        // Handle Errors
        if(dev === true) { console.log("Output for User Insert:", result); }
        if(result.error) { console.log("Error::", result.error); return result; }
        return this; // Returns User Object for Session
    }
    // #endregion

    private data: UserData;

    constructor(data: UserData) { this.data = {
        uuid: data?.uuid ?? null,
        name: data?.name ?? null,
        status: data?.status ?? 0,
        hex: data?.hex ?? 'ffffff',
        age: data?.age ?? Date.now(),
        last: data?.last ?? Date.now(),

        auth: data?.auth ?? [],
        subs: data?.subs ?? [],
        roles: data?.roles ?? []
    }; }

    getID() { return this.data.uuid; }

    toJSON() {
        return {
            uuid: this.data?.uuid ?? '',
            name: this.data?.name ?? '',
            status: this.data?.status ?? 0,
            hex: this.data?.hex ?? 'ffffff',
            age: this.data?.age ?? Date.now(),
            last: this.data?.last ?? Date.now(),

            auth: this.data?.auth ?? [],
            subs: this.data?.subs ?? [],
            roles: this.data?.roles ?? []
        } as UserData;
    }
}