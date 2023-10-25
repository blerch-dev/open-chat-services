import { Server as HTTPServer, IncomingMessage, ServerResponse } from "http";

import cors from "cors";
import express from "express";
import session from "express-session"
import { WebSocketServer, WebSocket } from "ws";

import { ServerParams, ChatServerParams } from "./Interfaces";
import { API } from '../Utils/Query';

export class Server {
    private app = express();
    private listener: HTTPServer<typeof IncomingMessage, typeof ServerResponse> | undefined;
    private chat: ChatServer | undefined;

    constructor(params: ServerParams) { this.Configure(params); }

    Configure(params: ServerParams) {
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
        if(params?.auth === true) { this.app.use(API); }

        this.listener = this.app.listen(params.port ?? 8000);
        
        // Chat Server
        if(params?.chat === true) { this.chat = new ChatServer({ server: this, listener: this.listener }); }
    }
}

export class ChatServer {
    private server = new WebSocketServer({ noServer: true });

    constructor(params: ChatServerParams) { this.Configure(params); }

    Configure(params: ChatServerParams) {
        params.listener.on('upgrade', (request, socket, head) => {
            this.server.handleUpgrade(request, socket, head, this.Connection);
        });
    }

    Connection(client: WebSocket, request: IncomingMessage): void {

    }
}