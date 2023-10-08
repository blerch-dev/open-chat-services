import { IncomingMessage } from "http";

import express from "express";
import session from "express-session"
import { WebSocketServer, WebSocket } from "ws";

import { ServerParams, ChatServerParams } from "./Interfaces";
import { API } from './Query';

export class Server {
    private app = express();
    private listener;

    constructor(params: ServerParams) { this.Configure(params); }

    Configure(params: ServerParams) {
        this.app.set('trust proxy', 1);
        this.app.use(express.urlencoded({ extended: true }));
        this.app.use(express.json());
        this.app.use(session({
            secret: 'test',
            resave: false,
            saveUninitialized: false,
            cookie: { httpOnly: true }
        }));

        // Auth Server
        if(params?.api ?? true) { this.app.use(API); }

        this.listener = this.app.listen(params.port ?? 8000);
        
        // Chat Server
        if(params?.chat ?? false) { new ChatServer({ server: this.listener }); }
    }
}

export class ChatServer {
    private server = new WebSocketServer({ noServer: true });

    constructor(params: ChatServerParams) { this.Configure(params); }

    Configure(params: ChatServerParams) {
        params.server.on('upgrade', (request, socket, head) => {
            this.server.handleUpgrade(request, socket, head, this.Connection);
        });
    }

    Connection(client: WebSocket, request: IncomingMessage): void {

    }
}