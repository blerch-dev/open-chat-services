import { Server } from "../Models/Server";

export class ChatService extends Server {

    public ServiceType: () => string;

    constructor(port: number, domain: string, dev?: boolean) {
        super({ port, dev: dev ?? process.env.NODE_ENV === 'dev', chat: true, allowedDomains: [`chat.${domain}`] });
        this.ServiceType = () => { return `Chat Service on Port: ${port}` }
    }
}