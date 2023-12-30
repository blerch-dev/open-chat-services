import { QueryResult } from "pg";
import { Router } from "express";

import { GenerateID, ServerError, ValidUUID, ts } from "../Utils";
import { HTTPResponse, ChannelData, Model } from "./Interfaces";
import { Room } from "./Room";
import { ServerErrorType } from "./Enums";
import { AffectedRowCount } from "../Data/Query";

export class Channel implements Model {

    // #region Channel Creation
    static CreateFromData(data: ChannelData): Channel | ServerError {
        if(data.slug.length < 3 || data.name.length > 32) {
            return new ServerError(ServerErrorType.BadRequest, "Name is an invalid length. Must be between 3 and 32 characters.");
        }

        if(!ValidUUID(data?.owner_uuid)) { return new ServerError(ServerErrorType.BadRequest, "Invalid Owner UUID given."); }

        data.id = Channel.GenerateID();
        data.slug = data?.slug?.toLowerCase() ?? data?.id?.toLowerCase();

        return new Channel(data);
    }

    // Same as CreateFromData, but Returns HTTP Formatted Response
    static async FormValidation(data: ChannelData): Promise<Channel | HTTPResponse> {
        if(data?.id) {
            return { okay: false, code: 422, message: "Expecting Channel Creation Form Data, got external ID in Channel Object Creation Flow."}
        }

        let channel = Channel.CreateFromData(data);
        if(channel instanceof Channel) { return channel; } else { return channel.getAsHTTPResponse(); }
    }

    static GenerateID() { return GenerateID(8); }
    // #endregion

    // #region DB and API
    // Channel ID will always represent a Room ID
    static DBTableFormat = (drop: boolean = false) => {
        return `
            ${drop === true ? 'DROP TABLE IF EXISTS "channels";' : ''}
            CREATE TABLE IF NOT EXISTS "channels" (
                "id"            varchar(32) NOT NULL UNIQUE,
                "slug"          varchar(32) NOT NULL UNIQUE,
                "owner_uuid"    uuid NOT NULL,
                "name"          varchar(32),
                "domain"        varchar(256),
                "icon"          varchar(256),
                "creation"      timestamp without time zone NOT NULL DEFAULT NOW(),
                "last_active"   timestamp without time zone NOT NULL DEFAULT NOW(),
                PRIMARY KEY ("id")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "channel_connections";' : ''}
            CREATE TABLE IF NOT EXISTS "channel_connections" (
                "channel_id"    varchar(32) NOT NULL UNIQUE,
                "twitch_id"     varchar(64),
                "youtube_id"    varchar(64),
                "kick_id"       varchar(64),
                "rumble_id"     varchar(64),
                PRIMARY KEY ("channel_id")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "roles";' : ''}
            CREATE TABLE IF NOT EXISTS "roles" (
                "id"            serial NOT NULL UNIQUE,
                "name"          varchar(32) NOT NULL,
                "value"         bigint NOT NULL,
                "type"          smallint NOT NULL DEFAULT 0,
                "badge_id"      int NOT NULL,
                "channel_id"    varchar(32),
                PRIMARY KEY ("id")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "subscriptions";' : '' /* Level = ID Equiv, with type mod (100, 200, 201) */}
            CREATE TABLE IF NOT EXISTS "subscriptions" (
                "id"            serial NOT NULL UNIQUE,
                "level"         smallint NOT NULL,
                "name"          varchar(64) NOT NULL,
                "badge_id"      int NOT NULL,
                "channel_id"    varchar(32),
                PRIMARY KEY ("id")
            );

            ${drop === true ? 'DROP TABLE IF EXISTS "badges";' : ''}
            CREATE TABLE IF NOT EXISTS "badges" (
                "id"            serial NOT NULL UNIQUE,
                "name"          varchar(32) NOT NULL,
                "icon"          varchar(256) NOT NULL,
                "channel_id"    varchar(32),
                PRIMARY KEY ("id")
            );
        `;
    }

    static APIFunctions = {
        GetOwnedChannels: 
        async (uuid: any, callback: (str: string, val: any[]) => Promise<QueryResult>): Promise<Channel[] | ServerError> => {
            let result = await callback('SELECT * FROM channels WHERE owner_uuid = $1', [uuid]);
            if(result.rowCount === 0) { return new ServerError(ServerErrorType.MissingResource, "No Channel Found for Given Owner UUID."); }
            let channels = [];
            for(let i = 0; i < result.rowCount; i++) {
                let channel = Channel.CreateFromData(result.rows[i]);
                if(channel instanceof Channel) { channels.push(channel); }
            }
            return channels;
        },

        GetRelatedChannels: 
        async (uuid: any, callback: (str: string, val: any[]) => Promise<QueryResult>): Promise<Channel[] | ServerError> => {
            return new ServerError();
        },

        SafeInsert:
        async (channel: ChannelData, callback: (str: string, val: any[]) => Promise<QueryResult>): Promise<boolean | ServerError> => {
            // Check if Id/Slug is Unique
            let result = await callback(`SELECT 1 FROM channels WHERE id = $1 OR LOWER(slug) = $2`, [channel.id, channel.slug.toLowerCase()]);

            // Handle Error for Uniques
            if(result.rows.length > 0) { 
                return new ServerError(ServerErrorType.UnprocessableContent, "Invalid ID or Slug.")
            }

            // Insert Channel
            result = await callback(
                `INSERT INTO channels (id, slug, owner_uuid, name, domain, icon, creation, last_active) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [channel.id, channel.slug, channel.owner_uuid, channel.domain, channel.icon, ts(channel.age), ts(channel.last)]
            );
            
            // Insert to Associated Tables - TODO

            return AffectedRowCount(result) > 0; // Returns 
        }
    }

    static getAPIRouter(callback: (str: string, val: any[]) => Promise<QueryResult>) {
        const route = Router();

        route.get('/', async (req, res, next) => {
            // If Session, Get Channels with Owner UUID that matches Current User or All Related Channels
            if(req.session.user) {
                let result = await Channel.APIFunctions.GetOwnedChannels(req.session.user.uuid, callback);
                if(result instanceof ServerError) { return res.json(result.toJSON()); }
                return res.json(JSON.stringify({ channels: result.map((ch) => ch.toJSON()) }));
            }

            // Response for No User Index Search, Might Add Something Else Here Later
            let error = new ServerError(ServerErrorType.AuthenticationError, "No User to find Channel's owned.");
            return res.status(error.getStatus()).json(error.toJSON());
        });

        route.get('/id/:id', async (req, res, next) => {
            let result = await callback('SELECT * FROM channels WHERE id = $1', [req.params.id]);
            return res.json({ results: result.rows, meta: {} });
        });

        route.get('/search/:search', async (req, res, next) => {
            let result = await callback(
                'SELECT * FROM channels WHERE id ILIKE $1 OR slug ILIKE $1 OR name ILIKE $1 OR domain ILIKE $1', 
                [req.params.search]
            );
            return res.json({ results: result.rows, meta: {} });
        });
        
        route.post('/create', async (req, res, next) => {
            // Parses Form Body
            let result = await Channel.FormValidation(req.body);
            if(result instanceof Channel) {
                let insert = await Channel.APIFunctions.SafeInsert(result.toJSON(), callback);
                if(insert instanceof ServerError) { return res.status(insert.getStatus()).json(insert.toJSON()); }
                return res.json({ channel: result.toJSON(), added: insert as boolean });
            } else {
                // Handle Error
                return res.status(result.code).json(result);
            }
        });

        return route;
    }
    // #endregion

    private data: ChannelData;
    private room: Room;

    constructor(data: ChannelData) { 
        this.data = {
            id: data.id ?? null,
            slug: data.slug ?? null,
            owner_uuid: data.owner_uuid ?? null,
            name: data.name ?? data.slug ?? '',
            domain: data.domain ?? `${this.data.slug ?? this.data.id}.openchat.dev`,
            icon: data.icon ?? '/channel-logo.svg',
            age: data.age ?? Date.now(),
            last: data.last ?? Date.now(),

            embeds: data.embeds ?? {},

            badges: data.badges ?? [],
            emotes: data.emotes ?? [],
            roles: data.roles ?? []
        };

        this.room = new Room({
            id: this.data.id,
            name: this.data.name ?? this.data.slug ?? this.data.id ?? 'unnamed-room'
        });
    }

    toJSON() {
        return {
            id: this.data.id ?? null,
            slug: this.data.slug ?? null,
            owner_uuid: this.data.owner_uuid ?? null,
            name: this.data.name ?? this.data.slug ?? '',
            domain: this.data.domain ?? `${this.data.slug ?? this.data.id}.openchat.dev`,
            icon: this.data.icon ?? '/channel-logo.svg',
            age: this.data?.age ?? Date.now(),
            last: this.data?.last ?? Date.now(),

            embeds: this.data.embeds ?? {},

            badges: this.data.badges ?? [],
            emotes: this.data.emotes ?? [],
            roles: this.data.roles ?? []
        } as ChannelData
    }
}