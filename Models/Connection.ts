import { Router } from "express";

import { Channel } from "./Channel";
import { User } from "./User";
import { APIError, APIResponse,  } from "./Interfaces";
import { GenerateUUID } from "../Utils";
import { Platforms } from "./Enums";

export class PlatformManager {
    private twitch: TwitchOAuth;
    private youtube: YoutubeOAuth;

    constructor(params?: { twitch: any, youtube: any }) {
        this.twitch = new TwitchOAuth(params?.twitch ?? { 
            client: { id: process.env.TWITCH_CLIENT_ID, secret: process.env.TWITCH_CLIENT_SECRET },
            dev: true
        });

        this.youtube = new YoutubeOAuth(params?.youtube ?? { 
            client: { id: process.env.YOUTUBE_CLIENT_ID, secret: process.env.YOUTUBE_CLIENT_SECRET }
        });
    }

    GetRouter() {
        const route = Router();

        route.use('/twitch', this.twitch.Handler());
        route.use('/youtube', this.youtube.Handler());

        return route;
    }
}

abstract class OAuth {
    protected client: { id: string, secret: string };
    protected dev: boolean;

    constructor() {}

    abstract Authenticate(data: any): any;
    abstract Verify(data: any): any;
    abstract Handler(): Router;

    abstract UserSubbedToChannel(user: User, Channel: Channel): void;
    abstract CreateUserFromPlatformData(data: any): User | Error;
}

export class TwitchOAuth extends OAuth {
    constructor(params: { client: { id: string, secret: string }, dev?: boolean }) {
        super();

        this.client = params.client;
        this.dev = params?.dev ?? false;
    }

    public Authenticate(data: { origin: string }): string {
        let auth_url = `https://id.twitch.tv/oauth2/authorize?client_id=${this.client.id}
            &redirect_uri=http${this.dev ? '' : 's'}://${data.origin}/oauth/twitch/auth
            &response_type=code 
            &scope=user:read:subscriptions+channel:read:polls+channel:read:subscriptions
            +channel:read:vips+moderation:read+moderator:read:blocked_terms+chat:edit+chat:read
            &state=twitch
            `.replace(/\s/g,'');

        return auth_url;
    }

    // Break Into Functions
    public async Verify(data: { code: string, origin: string }): Promise<APIResponse | APIError> {
        let validate_url = `https://id.twitch.tv/oauth2/token?client_id=${this.client.id}
            &client_secret=${this.client.secret}
            &code=${data.code}
            &grant_type=authorization_code
            &redirect_uri=http${this.dev ? '' : 's'}://${data.origin}/oauth/twitch/auth
            `.replace(/\s/g,'');

        let validation = await fetch(validate_url, { method: 'POST', headers: {
            'Content-Type': 'application/vnd.twitchtv.v3+json'
        } });

        let json = await validation.json();

        let result = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${json.access_token}`,
                'Client-Id': `${this.client.id}`
            }
        });

        let user = await this.GetUserFromData(await result.json());
        console.log("User Result:", user);
        return { message: 'testing...' }
    }

    private async GetUserFromData(json: any): Promise<APIResponse | APIError> {
        const twitch_data = Array.isArray(json?.data) && json?.data[0]?.id !== undefined ? json.data[0] : null;
        console.log("Twitch Data:", twitch_data);

        // Needs better url set up
        return await (await fetch(`http://auth.app.tv/user/connection/twitch/${twitch_data.id}`)).json();
    }

    public Handler() {
        let route = Router();

        route.get('/', (req, res, next) => { 
            req.session.state = { origin: req.headers.origin }
            res.redirect(this.Authenticate({ origin: req.headers.origin })); 
        });

        route.get('/auth', async (req, res, next) => {
            // should be user or error
            let user = await this.Verify({ code: req.query.code as string, origin: req.session?.state?.origin ?? req.headers.origin });
            res.end();

            // apply session to request, return everything
        });

        return route;
    }

    public async UserSubbedToChannel(user: User, Channel: Channel) {

    }

    public CreateUserFromPlatformData(data: { twitch: any, input: any }) {
        if(data?.twitch?.id == undefined || data?.twitch?.login == undefined) { 
            return new Error("Invalid Twitch Data"); 
        }

        return User.CreateFromData({
            uuid: GenerateUUID(),
            name: data.input?.name ?? data.twitch?.display_name ?? data.twitch.login,
            auth: [{ platform: Platforms.Twitch, id: data.twitch.id, name: data.twitch.login }]
        });
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

    public Handler() {
        let route = Router();

        return route;
    }

    public async UserSubbedToChannel(user: User, Channel: Channel) {

    }

    // Copied from twitch, change to match youtube data format
    public CreateUserFromPlatformData(data: { youtube: any, input: any }) {
        if(data?.youtube?.id == undefined || data?.youtube?.login == undefined) { 
            return new Error("Invalid Twitch Data"); 
        }
        
        return User.CreateFromData({
            uuid: GenerateUUID(),
            name: data.input?.name ?? data.youtube?.display_name ?? data.youtube.login,
            auth: [{ platform: Platforms.Youtube, id: data.youtube.id, name: data.youtube.login }]
        });
    }
}