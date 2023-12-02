import { Server as HTTPServer, IncomingMessage, ServerResponse } from "http";

import { WebSocketServer, WebSocket } from "ws";
import * as express from "express";
import * as session from "express-session"
import * as cors from "cors";

import { ServerParams, ChatServerParams, AuthServerParams, UserData, ChatMessage } from "./Interfaces";
import { APIConnection, NATSClient } from "../Data";
import { DatabaseResponse, sleep } from "../Utils";
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
    private rooms = new Set<Room>();

    constructor(params: ChatServerParams) { this.Configure(params); }

    Configure(params: ChatServerParams) {
        params.listener.on('upgrade', (...params) => {
            this.wsserver.handleUpgrade(...params, (...args) => { this.Connection(...args); });
        });
    }

    Connection(client: WebSocket, request: IncomingMessage): void {
        const user = this.GetUserFromRequest(request);
        const room = this.FindClientRoom(request);
        if(!room?.addUser(null, client)) { 
            return client.send(JSON.stringify({ type: ChatMessageType.Error, value: "Couldn't Join Room." })); 
        }

        client.on('message', (data) => { const msg = JSON.parse(data.toString()); room?.dispatch(msg); });
        client.on('close', () => { room?.removeSocketFromUser(user, client); });
    }

    FindClientRoom(request: IncomingMessage): Room | null {
        const { url, headers } = request; const origin = headers.origin;
        return null;
    }

    GetUserFromRequest(request: IncomingMessage): User | null {
        return null;
    }
}