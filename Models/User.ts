import { Router } from "express";
import { QueryResult } from "pg";
import { Server, WebSocket } from "ws";

import { ChatMessage, Model, UserData, HTTPResponse, PlatformConnection } from "./Interfaces";
import { GenerateUUID,ServerError,ValidUUID, ts } from "../Utils";
import { ServerErrorType } from "./Enums";
import { AffectedRowCount } from "../Data/Query";

export class User implements Model {
    // #region User Creation
    static CreateFromData(data: UserData): User | ServerError {
        if(data?.name?.length < 3 || data?.name?.length > 32) {
            return new ServerError(ServerErrorType.BadRequest, "Name is an invalid length. Must be between 3 and 32 characters.");
        }

        // Bad UUID is blocked from creating a user, if no uuid we assume it is a non-db instance of a User and generate a new one.
        if(data.uuid && !ValidUUID(data?.uuid)) { return new ServerError(ServerErrorType.BadRequest, "Invalid UUID given."); }

        data.uuid = GenerateUUID(); //
        return new User(data);
    }

    // Same as CreateFromData, but Returns HTTP Formatted Response
    static async FormValidation(data: UserData): Promise<User | HTTPResponse> {
        if(data?.uuid) { 
            return { okay: false, code: 422, message: "Expecting User Creation Form Data, got external ID in User Object Creation Flow."}
        }

        let user = User.CreateFromData(data);
        if(user instanceof User) { return user; } else { return user.getAsHTTPResponse(); }
    }

    static CreateFromOAuth(connection: PlatformConnection): User | ServerError {
        if(!connection?.id || !connection?.name) {
            return new ServerError(ServerErrorType.UnprocessableContent, "Missing required platform data.");
        }

        return User.CreateFromData({ uuid: GenerateUUID(), name: connection.name, auth: [connection] });
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
                "creation"      timestamp without time zone NOT NULL DEFAULT NOW(),
                "last_active"   timestamp without time zone NOT NULL DEFAULT NOW(),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_twitch_connection";' : ''}
            CREATE TABLE IF NOT EXISTS "user_twitch_connection" (
                "uuid"          uuid NOT NULL UNIQUE,
                "id"            varchar(64) UNIQUE,
                "name"          varchar(32),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_youtube_connection";' : ''}
            CREATE TABLE IF NOT EXISTS "user_youtube_connection" (
                "uuid"          uuid NOT NULL UNIQUE,
                "id"            varchar(64) UNIQUE,
                "name"          varchar(32),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_discord_connection";' : ''}
            CREATE TABLE IF NOT EXISTS "user_discord_connection" (
                "uuid"          uuid NOT NULL UNIQUE,
                "id"            varchar(64) UNIQUE,
                "name"          varchar(32),
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_subscriptions";' : ''}
            CREATE TABLE IF NOT EXISTS "user_subscriptions" (
                "id"            serial NOT NULL UNIQUE,
                "uuid"          uuid NOT NULL,
                "sub_id"        int NOT NULL,
                "creation"      timestamp without time zone NOT NULL DEFAULT NOW(),
                "expiration"    timestamp without time zone NOT NULL DEFAULT NOW() + '1 month'::interval,
                PRIMARY KEY ("id")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_roles";' : ''}
            CREATE TABLE IF NOT EXISTS "user_roles" (
                "uuid"          uuid NOT NULL,
                "role_id"       int NOT NULL,
                "creation"      timestamp without time zone NOT NULL DEFAULT NOW(),
                "enabled"       boolean NOT NULL DEFAULT TRUE,
                PRIMARY KEY ("uuid")
            );
            
            ${drop === true ? 'DROP TABLE IF EXISTS "user_session_tokens";' : ''}
            CREATE TABLE IF NOT EXISTS "user_session_tokens" (
                "uuid"                  uuid NOT NULL UNIQUE,
                "selector"              varchar(12) NOT NULL UNIQUE,
                "hashed_validator"      varchar(128) NOT NULL,
                "salt_code"             varchar(8) NOT NULL,
                "expires"               timestamp without time zone NOT NULL DEFAULT NOW() + '1 week'::interval,
                PRIMARY KEY ("selector")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_access_tokens";' : '' /* API Usage for Third Party Apps */}
            CREATE TABLE IF NOT EXISTS "user_access_tokens" (
                "uuid"                  uuid NOT NULL UNIQUE,
                "selector"              varchar(12) NOT NULL UNIQUE,
                "hashed_validator"      varchar(128) NOT NULL,
                "salt_code"             varchar(8) NOT NULL,
                "expires"               timestamp without time zone NOT NULL DEFAULT NOW() + '1 year'::interval,
                "token_level"           smallint DEFAULT 0,
                PRIMARY KEY ("uuid")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "user_creation_tokens";' : '' /* For Account Creation with Roles */}
            CREATE TABLE IF NOT EXISTS "user_creation_tokens" (
                "uuid"                  uuid NOT NULL UNIQUE,
                "selector"              varchar(12) NOT NULL UNIQUE,
                "hashed_validator"      varchar(128) NOT NULL,
                "salt_code"             varchar(8) NOT NULL,
                "role_id"               int NOT NULL,
                PRIMARY KEY ("uuid")
            );
        `;

        // CREATE A VIEW FOR AUTO USER OBJECT FETCHING STUFF, will simplify api
    }    

    static APIFunctions = {
        GetUser: 
        async (uuid: any, callback: (str: string, val: any[]) => Promise<QueryResult>): Promise<User | ServerError> => {
            let result = await callback('SELECT * FROM users WHERE uuid = $1', [uuid]); // Combine with View - PG
            if(result.rowCount === 0) { return new ServerError(ServerErrorType.MissingResource, "No User with Given UUID."); }
            else if(result.rowCount > 1) { return new ServerError(ServerErrorType.AuthenticationError, "Non-Unique UUID. Contact Admins."); }
            return User.CreateFromData(result.rows[0]);
        },

        GetUserByName: 
        async (name: string, callback: (str: string, val: any[]) => Promise<QueryResult>): Promise<User[] | ServerError> => {
            return new ServerError();
        },

        GetUserByAny: 
        async (field: string, data: any, callback: (str: string, val: any[]) => Promise<QueryResult>): Promise<User[] | ServerError> => {
            return new ServerError();
        },

        SafeInsert:
        async (user: UserData, callback: (str: string, val: any[]) => Promise<QueryResult>): Promise<boolean | ServerError> => {
            // return new ServerError();

            // Check if Name/UUID is Unique
            let result = await callback(`SELECT 1 FROM users WHERE uuid = $1 OR LOWER(name) = $2`, [user.uuid, user.name.toLowerCase()]);

            // Handle Error for Uniques
            if(result.rows.length > 0) { 
                return new ServerError(ServerErrorType.UnprocessableContent, "Invalid UUID or Username.");
            }

            // Insert User
            result = await callback(
                'INSERT INTO users (uuid, name, status, hex, creation, last_active) VALUES ($1, $2, $3, $4, $5, $6)',
                [user.uuid, user.name, user.status, user.hex, ts(user.age), ts(user.last)]
            );

            // Insert to Associated Tables - TODO

            return AffectedRowCount(result) > 0;
        },
    }

    static getAPIRouter(callback: (str: string, val: any[]) => Promise<QueryResult>) {
        const route = Router();

        route.get('/me', async (req, res, next) => {
            // If Session, Fetch From DB, Refresh Session with Data, Return Data
            if(req.session.user) {
                // Respond if Cache is Fresh - No Detected Changes - TODO

                // Refresh from DB
                let result = await User.APIFunctions.GetUser(req.session.user.uuid, callback);
                if(result instanceof ServerError) { return res.json(result.toJSON()); }
                // Set Session
                req.session.user = (result as User).toJSON();
                return res.json({ me: result.toJSON() });
            }

            let error = new ServerError(ServerErrorType.AuthenticationError, "No User Session Data.");
            return res.status(error.getStatus()).json(error.toJSON());
        });

        // Might Gate User Search to Mod/Bot Roles and Above, Open for Now
        route.get('/id/:id', async (req, res, next) => {
            let result = await callback('SELECT * FROM users WHERE uuid = $1', [req.params.id]);
            return res.json({ results: result.rows, meta: { } });
        });

        route.delete('/id/:id', async (req, res, next) => {
            let result = await callback('DELETE FROM users WHERE uuid::text LIKE $1', [req.params.id]);
            return res.json({ results: result.rows, meta: { affectedRows: result.rowCount } });
        })

        route.get('/search/:search', async (req, res, next) => {
            let result = await callback('SELECT * FROM users WHERE uuid::text LIKE $1 OR name ILIKE $1', [req.params.search]);
            return res.json({ results: result.rows, meta: { } });
        });

        route.post('/create', async (req, res, next) => {
            // Parses Form Body - No Session, This should be handled where we create them programmatically
            let result = await User.FormValidation(req.body);
            if(result instanceof User) {
                let insert = await User.APIFunctions.SafeInsert(result.toJSON(), callback);
                if(insert instanceof ServerError) { return res.status(insert.getStatus()).json(insert.toJSON()); }
                return res.json({ user: result.toJSON(), added: insert as boolean });
            } else {
                // Handle Error
                return res.status(result.code).json(result);
            }
        });

        // Connections
        route.get('/connection/:user_id', async (req, res, next) => {
            // gets all connections
        })

        route.post('/connection/:platform', async (req, res, next) => {

        });

        route.get('/connection/:platform/:platform_id', async (req, res, next) => {
            let result =  await callback(`
                SELECT * FROM users WHERE uuid = (
                    SELECT uuid FROM user_${req.params.platform}_connection WHERE id = $1
                )
            `, [req.params.platform_id]);

            return res.json({ results: result.rows, meta: {} });
        });

        // Dev Only
        route.get('/all', async (req, res) => {
            let result = await callback(`SELECT * FROM users`, []);
            return res.json({ results: result.rows, meta: {} });
        });

        return route;
    }
    // #endregion

    private data: UserData;
    private sockets: Set<WebSocket>

    constructor(data: UserData) { 
        this.sockets = new Set<WebSocket>();
        this.data = {
            uuid: data?.uuid ?? null,
            name: data?.name ?? null,
            status: data?.status ?? 0,
            hex: data?.hex ?? 'ffffff',
            age: data?.age ?? Date.now(),
            last: data?.last ?? Date.now(),

            auth: data?.auth ?? [],
            subs: data?.subs ?? [],
            roles: data?.roles ?? [],
            badges: this.data?.badges ?? []
        }; 
    }

    getID() { return this.data.uuid; }
    getName() { return this.data.name; }

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
            roles: this.data?.roles ?? [],
            badges: this.data?.badges ?? []
        } as UserData;
    }

    getSockets() {
        return this.sockets;
    }

    addSocket(socket: WebSocket) {
        return this.sockets.add(socket);
    }

    removeSocket(socket: WebSocket) {
        return this.sockets.delete(socket);
    }

    async sendToSockets(msg: ChatMessage) {
        let str = JSON.stringify(msg);
        Array.from(this.sockets).forEach((socket) => { socket.send(str); });
    }

    hasRolePermission(role: number, channel_id?: string) {
        // channel_id should be undefined for global lookup and roles
        // needs testing for sure, but should work as expected (both for channel defined and undefined)
        return this.data.roles.filter(v => (v.channel_id === channel_id || v.channel_id === undefined) && v.type >= role).length > 0;
    }
}