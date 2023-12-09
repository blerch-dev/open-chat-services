import { Server } from "../Models/Server";

export class AuthService extends Server {

    public ServiceType: () => string;

    constructor(port: number, domain: string, dev?: boolean) {
        super({ port, dev: dev ?? process.env.NODE_ENV === 'dev', auth: true, allowedDomains: [`auth.${domain}`] });
        this.ServiceType = () => { return `Auth Service on Port: ${port}` }
    }
}