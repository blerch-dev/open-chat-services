import { QueryResult } from "pg";
import { Router } from "express";

import { DatabaseResponse, GenerateID, HTTPResponse, ValidUUID } from "../Utils";
import { ChannelData, Model } from "./Interfaces";

export class Channel implements Model {

    // #region Channel Creation
    static CreateFromData(data: ChannelData): Channel | Error {
        if(data.slug.length < 3 || data.name.length > 32) {
            return Error("Name is an invalid length. Must be between 3 and 32 characters.");
        }

        if(!ValidUUID(data?.owner_uuid)) { return Error("Invalid Owner UUID given."); }

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
        if(channel instanceof Channel) {
            return channel;
        } else {
            return { okay: false, code: 422, message: channel.message }
        }
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
                "twitch_id"     varchar(64),
                "youtube_id"    varchar(64),
                "kick_id"       varchar(64),
                "rumble_id"     varchar(64),
                PRIMARY KEY ("id")
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

    static getAPIRouter(callback: (str: string, val: any[]) => Promise<QueryResult>, dev: boolean = false) {
        const route = Router();

        route.get('/', async (req, res, next) => {
            // If Session, Get Channels with Owner UUID that matches Current User
            if(req.session.user) {
                // Refresh from DB
                let result = await callback('SELECT * FROM channels WHERE owner_uuid = $1', [req.session.user.uuid]);
                if(result.rowCount === 0) { 
                    return res.json({ error: { code: 500, message: "Invalid channel database results." } } as DatabaseResponse); 
                }

                // Create User from DB Read
                let channel = Channel.CreateFromData(result.rows[0]);
                if(channel instanceof Error) { 
                    return res.json({ error: { code: 500, message: "Issue creating channel from stored data." } } as DatabaseResponse); 
                }

                // Return Channel Data
                return res.json({ results: [(channel as Channel).toJSON()] } as DatabaseResponse);
            }

            return res.json({ error: { code: 401, message: "No User to find Channel's owned." } } as DatabaseResponse);
        });

        route.get('/id/:id', async (req, res, next) => {
            let result = await callback('SELECT * FROM channels WHERE id = $1', [req.params.id]);
            return res.json({ results: result.rows, meta: {} } as DatabaseResponse);
        });

        route.get('/search/:search', async (req, res, next) => {
            let result = await callback(
                'SELECT * FROM channels WHERE id ILIKE $1 OR slug ILIKE $1 OR name ILIKE $1 OR domain ILIKE $1', 
                [req.params.search]
            );
            return res.json({ results: result.rows, meta: {} } as DatabaseResponse);
        });
        
        route.post('/create', async (req, res, next) => {
            // Parses Form Body
            let result = await Channel.FormValidation(req.body);
            if(result instanceof Channel) {
                // Insert User into DB
                let channelCreation = await result.DBInsertSafe(async (str: string, val: any[]) => {
                    let result = await callback(str, val);
                    return { results: result.rows, meta: {} } as DatabaseResponse
                });
                
                // Dev Logging for Bug Fixing
                if(result === channelCreation && dev === true) { console.log("Channel Created and Inserted:", channelCreation); }
                else if(dev === true) { console.log("Issue Inserting Channel:", channelCreation); }

                // Handle Insert Results
                if(channelCreation instanceof Channel) {
                    return res.json({ results: [channelCreation.toJSON()] } as DatabaseResponse);
                } else {
                    return res.status(channelCreation.error?.code).json(channelCreation);
                }
            } else {
                // Handle Error
                return res.status(result.code).json(result);
            }
        });

        return route;
    }

    async DBInsertSafe(callback: (str: string, val: any[]) => Promise<DatabaseResponse>, dev: boolean = false) {
        // Check if Id/Slug is Unique
        let result = await callback(`SELECT 1 FROM channels WHERE id = $1 OR LOWER(slug) = $2`, [this.data.id, this.data.slug.toLowerCase()]);
        if(dev === true) { console.log("Check for Uniques:", result); }

        // Handle Error for Uniques
        if(result.error) { if(dev === true) { console.log("Error::", result.error); } return result; }
        else if(result.results.length > 0) { 
            if(dev === true) { console.log("Not Unique"); } 
            return { error: { code: 422, message: "Invalid ID or Slug." } } as DatabaseResponse; 
        }

        // Insert Channel
        result = await callback(
            `INSERT INTO users (id, slug, owner_uuid, name, domain, icon, twitch_id, youtube_id, kick_id, rumble_id) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                this.data.id, this.data.slug, this.data.owner_uuid, this.data.domain, this.data.icon, 
                this.data.embeds?.twitch, this.data.embeds?.youtube, this.data.embeds?.kick, this.data.embeds?.rumble
            ]
        );
        
        // Insert to Associated Tables - TODO

        // Handle Errors
        if(dev === true) { console.log("Output for User Insert:", result); }
        if(result.error) { console.log("Error::", result.error); return result; }
        return this; // Returns Channel Object
    }
    // #endregion

    private data: ChannelData;

    constructor(data: ChannelData) { this.data = data; }

    toJSON() {
        return {
            id: this.data.id ?? null,
            slug: this.data.slug ?? null,
            owner_uuid: this.data.owner_uuid ?? null,
            domain: this.data.domain ?? `${this.data.slug ?? this.data.id}.openchat.dev`,
            icon: this.data.icon ?? '/channel-logo.svg',
            embeds: this.data.embeds ?? {},

            badges: this.data.badges ?? [],
            emotes: this.data.emotes ?? [],
            roles: this.data.roles ?? []
        } as ChannelData
    }
}