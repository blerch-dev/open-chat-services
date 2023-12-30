import { Server as HTTPServer, IncomingMessage, ServerResponse, createServer } from "http";
import { Server as HTTPSServer, createServer as createSecureServer } from 'https';
import { join } from 'path';

import { WebSocketServer, WebSocket } from "ws";
import { createProxyServer } from "http-proxy";
import * as session from "express-session"
import * as express from "express";
import { QueryResult } from "pg";
import * as cors from "cors";

import { ServerParams, ChatServerParams, AuthServerParams, UserData, ChatMessage } from "./Interfaces";
import { GenerateID, GenerateName, GenerateUUID, sleep } from "../Utils";
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

    private server: HTTPServer;
    private sercure_server: HTTPSServer;

    private map: Map<string, { domains: string[], index: number }>;

    constructor(data: { 
        port: number, 
        domains?: string[], 
        dev?: boolean, 
        services?: Server[], 
        map?: Map<string, string[]> // make this a string[], string[] and map all combos - TODO
    }) {
        const domains = data?.domains ?? [];
        if(data.dev === true) { domains.push(`http://*.localhost:${data.port}`); }
        this.map = this.generateDomainMap(data.services, data.map);

        const handle_proxy = (req, res) => {
            // console.log("Req Origin:", req.headers.origin);
            // if(req.rawHeaders.includes('websocket')) { console.log("WS Request::", req.headers); } // issue with sockets not connecting/wrong url

            console.snap("Gateway Access:", req.headers.host, ' - From:', req.headers.referer);
            
            let gate = this.map.get(req.headers.host);
            if(gate === undefined) { return res.writeHead(404, "No Target Domain for Give Host.").end(); }

            let target_domain = gate.domains[gate.index];
            if(gate.index + 1 >= gate.domains.length) { gate.index = 0 } else { gate.index += 1; }
            this.proxy.web(req, res, { target: `${target_domain}` });
        }

        // Works - Domains Above for CORS on Gateway - Open to all currently
            // Requires Exact String, Will Add Regex Support Later
        this.server = createServer(handle_proxy).listen(data.port ?? 80);
        if(!data.dev) { this.sercure_server = createSecureServer(handle_proxy).listen(443); }
    }

    getDomainMap() { return this.map; }

    generateDomainMap(services?: Server[], map_input?: Map<string, string[]>) {
        let map = new Map() as Map<string, { domains: string[], index: number }>;

        // Auto Finds from Services
        let domain_relations: [string, string[]][] = map_input ? [...Array.from(map_input.entries())] : [];
        for(let i = 0; i < services.length; i++) {
            let _map = this.filterMapGrouping(services[i].GetAllowedDomains(), services[i].GetLocalDomain());
            domain_relations.push(...Array.from(_map.entries()));
        }

        // Maps Domains To All Input/Target Combos and Initializes Index Value
        for(let i = 0; i < domain_relations.length; i++) {
            let group = map.get(domain_relations[i][0])?.domains ?? [];
            map.set(domain_relations[i][0], { domains: [...group, ...domain_relations[i][1]], index: 0 })
        }

        // console.log(map);
        return map;
    }

    private filterMapGrouping(domain_list, target_domain) {
        let map = new Map<string, string[]>();
        for(let i = 0; i < domain_list.length; i++) {
            let group = [target_domain];
            if(map.has(domain_list[i])) { group = [...map.get(domain_list[i]), target_domain] } 
            map.set(domain_list[i], group);
        }

        return map;
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

                // if(this.dev === true) { console.snap("Invalid Origin:", origin); }
                return callback(new Error(`${console.getSnapTime()} | Invalid Origin: ${origin}`));

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
            this.app.use(await this.auth.getAPIRouter());
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

    private query: (str: string, val: any[]) => Promise<QueryResult<any>>;
    private oauth: PlatformManager;

    constructor(params: AuthServerParams) {
        this.DB = new APIConnection();
        this.server = params.server;

        this.query = (str: string, val: any[]) => { return this.DB.Query(str, val); }
        this.oauth = new PlatformManager(this.query);
    }

    isConnected() {
        return this.DB.connected;
    }

    async getAPIRouter() {
        const API = express.Router();

        // User Model - Requires Lambda to Keep Context
        API.use('/user', User.getAPIRouter(this.query));

        // Channel Model - Requires Lambda to Keep Context
        API.use('/channel', Channel.getAPIRouter(this.query));

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
        let room = new Room({ id: GenerateID(), name: url.substring(1) });
        this.rooms.set(url.substring(1), room);
        return room; 
    }

    GetUserFromRequest(request: IncomingMessage): User | null {
        const user = User.CreateFromData(this.server.ParseSession(request));
        return user instanceof User ? user : null;
    }

    GetRoomsAsList() {
        return Array.from(this.rooms, ([id, room]) => ({ id, room }));
    }
}