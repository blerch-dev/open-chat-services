import { createClient } from "redis";
import RedisStore from "connect-redis";

export class RedisClient {

    static GenerateStore(client: RedisClient) { return new RedisStore({ client: client.GetClient() }); }

    private data: any;

    private client;

    constructor(data?: any) {
        this.data = data;
        this.Configure();
    }

    private async Configure() {
        this.client = createClient();
        this.client.on('error', err => console.log("Redis Client Error:", err));
        await this.client.connect();
    }

    public GetClient() { return this.client; }
}