import { readFile } from 'fs/promises';
import { resolve } from 'path';

import { Router } from "express";
import { QueryResult } from 'pg';

import { Channel } from "./Channel";
import { User } from "./User";
import { PlatformConnection, UserData } from "./Interfaces";
import { GenerateUUID, ServerError } from "../Utils";
import { Platforms, ServerErrorType } from "./Enums";

export class PlatformManager {
    private twitch: TwitchOAuth;
    private youtube: YoutubeOAuth;

    private query: (str: string, val: any[]) => Promise<QueryResult>

    constructor(query: (str: string, val: any[]) => Promise<QueryResult>, params?: { twitch?: any, youtube?: any }) {
        this.twitch = new TwitchOAuth(params?.twitch ?? { 
            client: { id: process.env.TWITCH_CLIENT_ID, secret: process.env.TWITCH_CLIENT_SECRET },
            dev: true
        });

        this.youtube = new YoutubeOAuth(params?.youtube ?? { 
            client: { id: process.env.YOUTUBE_CLIENT_ID, secret: process.env.YOUTUBE_CLIENT_SECRET }
        });

        this.query = query;
    }

    GetRouter() {
        const route = Router();

        route.use('/twitch', this.twitch.Handler(this.query));
        route.use('/youtube', this.youtube.Handler(this.query));

        return route;
    }
}

abstract class OAuth {
    protected platform: string;
    protected client: { id: string, secret: string };
    protected dev: boolean;

    constructor() {}

    abstract Authenticate(data: any): any;
    abstract Verify(data: any): any;
    abstract Handler(query: (str: string, val: any[]) => Promise<QueryResult>): Router;

    abstract UserSubbedToChannel(user: User, Channel: Channel): void;
    abstract CreateUserFromPlatformData(data: any): User | ServerError;

    public async UserCreationForm(user: User | UserData) {
        if(user instanceof User) { return await readFile(resolve(__dirname, './Assets/HTML/ValidUser.html'), 'utf8'); }
        return await readFile(resolve(__dirname, './Assets/HTML/UserForm.html'), 'utf8');
    }
}

export class TwitchOAuth extends OAuth {
    constructor(params: { client: { id: string, secret: string }, dev?: boolean }) {
        super();

        this.platform = 'Twitch';
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
    public async Verify(data: { code: string, origin: string }): Promise<{ user: User | ServerError, connection: PlatformConnection }> {
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
        let result = await (await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${json.access_token}`,
                'Client-Id': `${this.client.id}`
            }
        })).json();

        const platform_connection = {
            id: result?.data?.[0]?.id ?? null,
            name: result?.data?.[0]?.login ?? null,
            platform: Platforms.Twitch
        } as PlatformConnection

        return { user: await this.GetUserFromData(result), connection: platform_connection };
    }

    private async GetUserFromData(json: any): Promise<User | ServerError> {
        const twitch_data = Array.isArray(json?.data) && json?.data[0]?.id !== undefined ? json.data[0] : null;

        // Needs better url set up
        let { results } = await (await fetch(`http://auth.app.tv/user/connection/twitch/${twitch_data.id}`)).json();
        return User.CreateFromData(results[0]);
    }

    public Handler(query: (str: string, val: any[]) => Promise<QueryResult>) {
        let route = Router();

        route.get('/', (req, res, next) => { 
            req.session.state = { referer: req.headers.referer }
            res.redirect(this.Authenticate({ origin: req.headers.origin })); 
        });

        route.get('/auth', async (req, res, next) => {
            // should be user or error
            let { user, connection } = await this.Verify({ code: req.query.code as string, origin: req.session?.state?.origin ?? req.headers.origin });
            if(user instanceof ServerError) {
                user = await User.CreateFromOAuth(connection);
                if(user instanceof ServerError) {
                    return res.redirect(req.session.state.referer + `/api/error?${user.toJSON()}`);
                }

                let insert = await User.APIFunctions.SafeInsert(user.toJSON(), query);
                if(insert instanceof ServerError) { return res.redirect(req.session.state.referer + `/api/error?${insert.toJSON()}`); }
                if(insert === false) { 
                    let error = new ServerError(ServerErrorType.ServerError, "Issue Adding User to Database. Try Again Later.");
                    return res.redirect(req.session.state.referer + `/api/error?${error.toJSON()}`);
                }
            }

            req.session.user = user.toJSON();
            return res.redirect(req.session.state?.referer);
        });

        return route;
    }

    public async UserSubbedToChannel(user: User, Channel: Channel) {

    }

    public CreateUserFromPlatformData(data: { twitch: any, input: any }) {
        if(data?.twitch?.id == undefined || data?.twitch?.login == undefined) { 
            return new ServerError(ServerErrorType.UnprocessableContent, "Invalid Twitch Data"); 
        }

        return User.CreateFromData({
            uuid: GenerateUUID(),
            name: data.input?.name ?? data.twitch?.display_name ?? data.twitch.login,
            auth: [{ platform: Platforms.Twitch, id: data.twitch.id, name: data.twitch.login }]
        });
    }
}

export class YoutubeOAuth extends OAuth {
    constructor(params: { client: { id: string, secret: string }, dev?: boolean }) {
        super();

        this.platform = 'Youtube';
        this.client = params.client;
        this.dev = params?.dev ?? false;
    }

    public Authenticate(data: any) {

    }

    public Verify(data: any) {
        
    }

    public Handler(query: any) {
        let route = Router();

        return route;
    }

    public async UserSubbedToChannel(user: User, Channel: Channel) {

    }

    // Copied from twitch, change to match youtube data format
    public CreateUserFromPlatformData(data: { youtube: any, input: any }) {
        if(data?.youtube?.id == undefined || data?.youtube?.login == undefined) { 
            return new ServerError(ServerErrorType.UnprocessableContent, "Invalid Youtube Data"); 
        }
        
        return User.CreateFromData({
            uuid: GenerateUUID(),
            name: data.input?.name ?? data.youtube?.display_name ?? data.youtube.login,
            auth: [{ platform: Platforms.Youtube, id: data.youtube.id, name: data.youtube.login }]
        });
    }
}