import { ChannelData } from "./Interfaces";

export class Channel {

    static DBTableFormat = (drop: boolean = false) => {
        return `
            ${drop === true ? 'DROP TABLE IF EXISTS "users";' : ''}
            CREATE TABLE IF NOT EXISTS "users" (
                "id"            varchar(32) NOT NULL UNIQUE,
                "slug"          varchar(32) NOT NULL UNIQUE,
                "owner"         uuid NOT NULL,
                "name"          varchar(32),
                "domain"        varchar(256),
                "icon"          varchar(256),
                "twitch_id"     varchar(64),
                "youtube_id"    varchar(64),
                PRIMARY KEY ("uuid")
            );
        `;
    }

    private data: ChannelData;

    constructor(data: ChannelData) { this.data = data; }
}