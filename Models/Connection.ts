import { Router } from "express";

export class PlatformManager {
    private twitch: TwitchOAuth;
    private youtube: YoutubeOAuth;

    constructor(params?: { twitch: any, youtube: any }) {
        this.twitch = new TwitchOAuth(params?.twitch ?? { client: 
            { id: process.env.TWITCH_CLIENT_ID, secret: process.env.TWITCH_CLIENT_SECRET } 
        });

        this.youtube = new YoutubeOAuth(params?.youtube ?? { client: 
            { id: process.env.YOUTUBE_CLIENT_ID, secret: process.env.YOUTUBE_CLIENT_SECRET } 
        });
    }

    GetRouter() {
        const route = Router();

        return route;
    }
}

abstract class OAuth {
    protected client: { id: string, secret: string }

    constructor() {}

    abstract Authenticate(data: any): any;
    abstract Verify(data: any): any;
}

export class TwitchOAuth extends OAuth {
    constructor(params: { client: { id: string, secret: string } }) {
        super();

        this.client = params.client;
    }

    public Authenticate(data: any) {

    }

    public Verify(data: any) {
        
    }
}

export class YoutubeOAuth extends OAuth {
    constructor(params: { client: { id: string, secret: string } }) {
        super();

        this.client = params.client;
    }

    public Authenticate(data: any) {

    }

    public Verify(data: any) {
        
    }
}