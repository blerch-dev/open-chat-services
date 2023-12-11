import { Server as HTTPServer, IncomingMessage, ServerResponse, createServer } from "http";

import { WebSocketServer, WebSocket } from "ws";
import { createProxyServer } from "http-proxy";
import * as session from "express-session"
import * as express from "express";
import * as cors from "cors";

import { ServerParams, ChatServerParams, AuthServerParams, UserData, ChatMessage } from "./Interfaces";
import { DatabaseResponse, GenerateID, GenerateName, GenerateUUID, sleep } from "../Utils";
import { APIConnection, NATSClient, RedisClient } from "../Data";
import { PlatformManager } from "./Connection";
import { ChatMessageType } from "./Enums";
import { Channel } from "./Channel";
import { User } from "./User";
import { Room } from "./Room";

declare module "express-session" {
    interface SessionData {
        user: UserData,
        state: any
    }
}

export class GatewayServer {
    private proxy = createProxyServer({});
    private server;

    constructor(data: { port: number, domains?: string[], dev?: boolean, services?: Server[] }) {
        const domains = data?.domains ?? [];
        if(data.dev === true) { domains.push(`http://*.localhost:${data.port}`); }

        // Works
        this.server = createServer((req, res) => {
            console.log("Req Origin:", req.headers.origin);

            for(let i = 0; i < data.services.length; i++) {
                if(data.services[i].GetAllowedDomains().includes(req.headers.host)) {
                    this.proxy.web(req, res, { target: `${data.services[i].GetLocalDomain()}` });
                    return;
                }
            }

            res.end();
        }).listen(data.port ?? 80);
    }
}

export class Server {
    private params: ServerParams;

    private dev: boolean;
    private app = express();
    private listener: HTTPServer<typeof IncomingMessage, typeof ServerResponse> | undefined;
    private auth: AuthServer | undefined;
    private chat: ChatServer | undefined;

    private nats: NATSClient;
    private redis: RedisClient;

    private sessionParser;

    constructor(params: ServerParams) {
        this.params = params;
        this.dev = params?.dev ?? process.env.NODE_ENV === 'dev' ?? false;

        // Session/Message Services (External)
        this.nats = new NATSClient(params.nats ?? { servers: 'localhost:4222' });
        this.redis = new RedisClient();

        this.Configure(params);
    }

    private async Configure(params: ServerParams) {
        this.app.set('trust proxy', 1);

        // #region Origin
        if(this.dev === true) {
            this.app.use((req, res, next) => {
                req.headers.original_origin = req.headers?.origin;
                req.headers.origin = req.headers?.origin || req.headers?.host; return next();
            });
        }

        // Auto Port Assigning for Localhost
        params.allowedDomains = params.allowedDomains.map((dom) => dom === 'localhost' ? `${dom}:${params.port}` : dom);

        this.app.use(cors({
            origin: (origin, callback) => {
                // Override
                if(params.allowedDomains?.includes(origin as string)) { return callback(null, true); }

                // Allows Subdomains
                let args = (origin as string)?.split('.') ?? [];
                if(args.length >= 2 && args[args.length - 2] === 'openchat' && args[args.length - 1] === 'dev') { 
                    return callback(null, true); 
                }

                // Allows Localhost
                if(this.dev && args.length >= 1 && args[args.length - 1].includes('localhost:')) {
                    return callback(null, true);
                }

                if(this.dev === true) { console.snap("Invalid Origin:", origin); }
                return callback(new Error("Invalid Origin"));

                // check db for channel domains, return true if acceptable - todo
                //callback(null, true);
            }
        }));
        // #endregion

        // #region Session and Validation
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());

        this.sessionParser = session({
            store: RedisClient.GenerateStore(this.redis),
            secret: 'test',
            resave: false,
            saveUninitialized: false,
            cookie: { httpOnly: true }
        });

        this.app.use(this.sessionParser);
        // #endregion

        // Server Info
        this.app.get('/server', (req, res, next) => { res.json({ server: this.params }); });

        // Auth Server
        if(params?.auth === true) { 
            this.auth = new AuthServer({ server: this });
            const api = await this.auth.getAPI();
            this.app.use(api);
        }

        this.listener = this.app.listen(params.port ?? 8000);
        
        // Chat Server
        if(params?.chat === true) { 
            this.chat = new ChatServer({ server: this, listener: this.listener }); 
        }

        this.app.all('*', (req, res) => {
            res.status(404).send(`404 - Page not Found (${params.port})`)
        });
    }

    public GetAllowedDomains() { return this.params.allowedDomains; }

    public GetLocalDomain() { return `http://localhost:${this.params.port}`; }
    public GetLocalPort() { return this.params.port; }

    public async DBFormat(force = false, attempts = 0) {
        if(!this.auth || attempts >= 10) { return this.dev ? console.snap("Could Not Connect to DB...") : null; }
        if(!this.auth.isConnected() && attempts < 10) {
            await sleep(100); return await this.DBFormat(force, attempts + 1);
        }

        const postTable = async (str: string) => {
            let result = await this.auth.QueryData(str);
            return true;
        }

        if(!await postTable(User.DBTableFormat(force))) { return this.dev ? console.snap("Issue with User DB Table...") : null; }
        if(!await postTable(Channel.DBTableFormat(force))) { return this.dev ? console.snap("Issue with Channel DB Table...") : null; }
    }

    public async Publish(value: string, data: any) {
        return await this.nats.Publish(value, data);
    }

    public async Subscribe(value: string, callback: Function) {
        return await this.nats.Subscribe(value, callback);
    }

    public ParseSession(request: IncomingMessage) {

    }
}

export class AuthServer {
    private DB: APIConnection;
    private server: Server;

    private oauth: PlatformManager;

    constructor(params: AuthServerParams) {
        this.DB = new APIConnection();
        this.server = params.server;

        this.oauth = new PlatformManager();
    }

    isConnected() {
        return this.DB.connected;
    }

    async getAPI() {
        const API = express.Router();

        // User Model - Requires Lambda to Keep Context
        API.use('/user', User.getAPIRouter((...args) => { return this.DB.Query(...args); }));

        // Channel Model - Requires Lambda to Keep Context
        API.use('/channel', Channel.getAPIRouter((...args) => { return this.DB.Query(...args); }));

        // OAuth
        API.use('/oauth', this.oauth.GetRouter());

        return API;
    }

    async QueryData(str: string, values: any[] = []) {
        return await this.DB.Query(str, values);
    }
}

export class ChatServer {
    private wsserver = new WebSocketServer({ noServer: true });
    private rooms = new Map<string, Room>();
    private server;

    constructor(params: ChatServerParams) {
        this.server = params.server;
        this.Configure(params); 
    }

    Configure(params: ChatServerParams) {
        params.listener.on('upgrade', (...params) => {
            this.wsserver.handleUpgrade(...params, (...args) => { this.Connection(...args); });
        });

        // Configure Rooms
            // Create Subs for Each Room 'SubscriptionValue' field on Room Object
            // Call (room).dispatch for incoming messages
    }

    Connection(client: WebSocket, request: IncomingMessage): void {
        const user = this.GetUserFromRequest(request);
        if(!(user instanceof User)) {
            return client.send(JSON.stringify({ type: ChatMessageType.State, value: "Log in to chat." }));
        }

        const room = this.FindClientRoom(request);
        if(!room?.addUser(user, client)) { 
            return client.send(JSON.stringify({ type: ChatMessageType.Error, value: "Couldn't join target room." })); 
        }

        const con_msg = { 
            type: ChatMessageType.State, 
            value: JSON.stringify(this.GetRoomsAsList()), 
            meta: { list: this.GetRoomsAsList() } 
        } as ChatMessage;
        client.send(JSON.stringify(con_msg));

        client.on('message', (data) => { const msg = JSON.parse(data.toString()); room?.dispatch(msg); });
        client.on('close', () => { room?.removeSocketFromUser(user, client); });
    }

    FindClientRoom(request: IncomingMessage): Room | null {
        const { url, headers } = request; const origin = headers.origin;

        // Creating Room if it doesn't Exist - Dev (Should Load from DB or MessageQueue Events)
        if(this.rooms.has(url.substring(1))) { return this.rooms.get(url.substring(1)); }
        else {
            let room = new Room({ id: GenerateID(), name: url.substring(1) });
            this.rooms.set(url.substring(1), room);
            return room; 
        }

        return null;
    }

    GetUserFromRequest(request: IncomingMessage): User | null {
        const user = User.CreateFromData(this.server.ParseSession(request));
        return user instanceof User ? user : null;
    }

    GetRoomsAsList() {
        return Array.from(this.rooms, ([id, room]) => ({ id, room }));
    }
}