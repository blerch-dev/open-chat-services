import { Server as HTTPServer, IncomingMessage, ServerResponse } from "http";

import * as cors from "cors";
import * as express from "express";
import * as session from "express-session"
import { WebSocketServer, WebSocket } from "ws";

import { ServerParams, ChatServerParams, AuthServerParams, UserData } from "./Interfaces";
import { APIConnection } from "../Data/Query";
import { DatabaseResponse, sleep } from "../Utils";
import { User } from "./User";
import { Channel } from "./Channel";
import { NATSClient } from "../Data/Message";
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
    private server: Server;
    private DB: APIConnection;

    constructor(params: AuthServerParams) {
        this.server = params.server;
        this.DB = new APIConnection();
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

    // Remove with Proper Implementation
    private dev_sockets = new Set<WebSocket>();

    constructor(params: ChatServerParams) { this.Configure(params); }

    Configure(params: ChatServerParams) {
        params.listener.on('upgrade', (...params) => {
            this.wsserver.handleUpgrade(...params, (...args) => { this.Connection(...args); });
        });
    }

    Connection(client: WebSocket, request: IncomingMessage): void {
        // Get Target Room from Connection (force client specification)
        // No Target, Get List of Targets and Close
        // Target, Add to Target
        this.dev_sockets.add(client);
        console.log("Headers:", (request as any).url, (request as any).headers.origin);
        client.on('close', () => { this.dev_sockets.delete(client); })
        client.on('message', (data) => {
            // console.log("Message:", JSON.parse(data.toString()));
            Array.from(this.dev_sockets.values()).forEach((soc) => { soc.send(data.toString()) });
        });
    }
}