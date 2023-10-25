import { Server as HTTPServer, IncomingMessage, ServerResponse } from "http";

import * as cors from "cors";
import * as express from "express";
import * as session from "express-session"
import { WebSocketServer, WebSocket } from "ws";

import { ServerParams, ChatServerParams, AuthServerParams } from "./Interfaces";
import { User } from "./User";
import { APIConnection } from "../Data/Query";

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
    }

    public UserCreationTest() {

    }
}

export class AuthServer {
    private server: Server;
    private DB: APIConnection;

    constructor(params: AuthServerParams) {
        this.server = params.server;
        this.DB = new APIConnection();
    }

    async getAPI() {
        const API = express.Router();

        // #region User
        API.get('/user/:id', (req, res, next) => {
            
        });
        
        API.post('/user/create', async (req, res, next) => {
            let result = await User.FormValidation(req.body);
            if(result instanceof User) {
                console.log("Created User:", result.toJSON());
                // create user
                // set session
            } else {
                return res.status(result.code).json(result);
            }
        });
        // #endregion

        return API;
    }
}

export class ChatServer {
    private wsserver = new WebSocketServer({ noServer: true });

    constructor(params: ChatServerParams) { this.Configure(params); }

    Configure(params: ChatServerParams) {
        params.listener.on('upgrade', (request, socket, head) => {
            this.wsserver.handleUpgrade(request, socket, head, this.Connection);
        });
    }

    Connection(client: WebSocket, request: IncomingMessage): void {

    }
}