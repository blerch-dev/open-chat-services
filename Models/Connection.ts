import { Router } from "express";

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
}

export class TwitchOAuth extends OAuth {
    constructor(params: { client: { id: string, secret: string }, dev?: boolean }) {
        super();

        this.client = params.client;
        this.dev = params?.dev ?? false;
    }

    public Authenticate(data: { origin: string }) {
        let redirect_url = `http${this.dev ? '' : 's'}://${data.origin}/oauth/twitch/auth`
        let auth_url = `https://id.twitch.tv/oauth2/authorize?client_id=${this.client.id}` +
            `&redirect_uri=${redirect_url}&response_type=code` + 
            `&scope=user:read:subscriptions+channel:read:polls+channel:read:subscriptions` +
            `+channel:read:vips+moderation:read+moderator:read:blocked_terms+chat:edit+chat:read` + 
            `&state=twitch`;

        console.log("Redirect URL:", redirect_url);
        return auth_url;
    }

    // Break Into Functions
    public async Verify(data: { code: string, origin: string }) {
        let validate_url = `https://id.twitch.tv/oauth2/token?client_id=${this.client.id}
            &client_secret=${this.client.secret}
            &code=${data.code}
            &grant_type=authorization_code
            &redirect_uri=http${this.dev ? '' : 's'}://${data.origin}/oauth/twitch/verify`.replace(/\s/g,'');

        let validation = await fetch(validate_url, { method: 'POST', headers: {
            'Content-Type': 'application/vnd.twitchtv.v3+json'
        } });

        let json = await validation.json();
        console.log("Twitch Access:", json);

        let result = await fetch('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${json.access_token}`,
                'Client-Id': `${this.client.id}`
            }
        });

        json = await result.json();
        console.log("Twitch Raw Data:", json);

        const twitch_data = Array.isArray(json?.data) && json?.data[0]?.id !== undefined ? json.data[0] : null;
        console.log("Twitch Data:", twitch_data);
        return twitch_data;
        // check db for user related
        // apply session to request, return everything
    }

    public Handler() {
        let route = Router();

        route.all('*', (req, res, next) => { console.snap("Hit Twitch Auth Flow:", req.headers.origin); next(); })

        route.get('/', (req, res, next) => { 
            req.session.state = { origin: req.headers.origin }
            res.redirect(this.Authenticate({ origin: req.headers.origin })); 
        });

        route.get('/auth', async (req, res, next) => {
            // should be user or error
            let data = await this.Verify({ code: req.query.code as string, origin: req.session.state ?? req.headers.origin });
            res.end();
        });

        route.get('/verify', async (req, res, next) => {
            console.log("Hit Verify Route!");
            res.end();
        });

        return route;
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
}