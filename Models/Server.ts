import { Server as HTTPServer, IncomingMessage, ServerResponse } from "http";

import { WebSocketServer, WebSocket } from "ws";
import * as express from "express";
import * as session from "express-session"
import * as cors from "cors";

import { ServerParams, ChatServerParams, AuthServerParams, UserData, ChatMessage } from "./Interfaces";
import { APIConnection, NATSClient } from "../Data";
import { DatabaseResponse, GenerateID, GenerateName, GenerateUUID, sleep } from "../Utils";
import { ChatMessageType } from "./Enums";
import { Channel } from "./Channel";
import { User } from "./User";
import { Room } from "./Room";

declare module "express-session" {
    interface SessionData {
        user: UserData
    }
}

export class Server {
    private app = express();
    private listener: HTTPServer<typeof IncomingMessage, typeof ServerResponse> | undefined;
    private auth: AuthServer | undefined;
    private chat: ChatServer | undefined;
    private nats: NATSClient | undefined;

    constructor(params: ServerParams) { this.Configure(params); }

    private async Configure(params: ServerParams) {
        this.app.set('trust proxy', 1);

        // Establish NATS Connection
        this.nats = new NATSClient(params.nats ?? { servers: 'localhost:4222' });

        // #region Origin
        if(params.dev === true) {
            this.app.use((req, res, next) => {
                req.headers.origin = req.headers.origin || req.headers.host; return next();
            });
        }

        this.app.use(cors({
            origin: (origin, callback) => {
                // Override
                if(params.allowedDomains?.includes(origin as string)) { return callback(null, true); }

                // Allows Subdomains
                let args = (origin as string)?.split('.') ?? [];
                if(args.length >= 2 && args[args.length - 2] === 'openchat' && args[args.length - 1] === 'dev') { 
                    return callback(null, true); 
                }

                if(params.dev === true) { console.log("Invalid Origin:", origin); }
                return callback(new Error("Invalid Origin"));

                // check db for channel domains, return true if acceptable - todo
                //callback(null, true);
            }
        }));
        // #endregion

        // #region Session and Validation
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
        this.app.use(session({
            secret: 'test',
            resave: false,
            saveUninitialized: false,
            cookie: { httpOnly: true }
        }));
        // #endregion

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

    public async DBFormat(force = false, attempts = 0) {
        if(!this.auth || attempts >= 10) { return console.log("Could Not Connect to DB..."); }
        if(!this.auth.isConnected() && attempts < 10) {
            await sleep(100); return await this.DBFormat(force, attempts + 1);
        }

        const postTable = async (str: string) => {
            let result = await this.auth.QueryData(str);
            return true;
        }

        if(!await postTable(User.DBTableFormat(force))) { return console.log("Issue with User DB Table..."); }
        if(!await postTable(Channel.DBTableFormat(force))) { return console.log("Issue with Channel DB Table..."); }
    }

    public async Publish(value: string, data: any) {
        return await this.nats.Publish(value, data);
    }

    public async Subscribe(value: string, callback: Function) {
        return await this.nats.Subscribe(value, callback);
    }
}

export class AuthServer {
    private DB: APIConnection;
    private server: Server;

    constructor(params: AuthServerParams) {
        this.DB = new APIConnection();
        this.server = params.server;
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

        return API;
    }

    async QueryData(str: string, values: any[] = []) {
        return await this.DB.Query(str, values);
    }
}

export class ChatServer {
    private wsserver = new WebSocketServer({ noServer: true });
    private rooms = new Map<string, Room>();

    constructor(params: ChatServerParams) { this.Configure(params); }

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
        const room = this.FindClientRoom(request);
        if(!room?.addUser(user, client)) { 
            return client.send(JSON.stringify({ type: ChatMessageType.Error, value: "Couldn't Join Room." })); 
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

        // Random User for Testing
        return new User({ uuid: GenerateUUID(), name: GenerateName() });

        return null;
    }

    GetRoomsAsList() {
        return Array.from(this.rooms, ([id, room]) => ({ id, room }));
    }
}