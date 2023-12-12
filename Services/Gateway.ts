// Custom - Low Dep Gateway for Domain/Service Filtering
    // Cookie for Filtering to Previous Results

import { GatewayServer, Server } from "../Models/Server";

export class GatewayService extends GatewayServer {

    public ServiceType: () => string;

    constructor(port: number, domains?: string[], dev?: boolean, services?: Server[], map?: Map<string, string[]>) {
        super({ port, domains, dev, services, map });
        this.ServiceType = () => { return `Gateway Service on Port: ${port}` }
    }
}