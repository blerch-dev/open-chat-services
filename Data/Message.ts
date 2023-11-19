// Message Bus Manager Here

// NATS Client
import { NatsConnection, Subscription, StringCodec, connect } from "nats";
export class NATSClient {
    private data: any;

    private codec = StringCodec();
    private client: NatsConnection;
    private connected = false;

    private callbacks: Set<{ value: string, callback: Function }> = new Set();
    private subscriptions: Set<Subscription> = new Set();

    constructor(data: any, ...subs: any[]) {
        console.log()
        this.data = data;
        this.Configure(data, subs);
    }

    private async Configure(data: any = { port: 4222 }, subs: any[] = []) {
        await this.Connect(data);

        // Apply Passed Subs
        subs.forEach((sub) => { this.Subscribe(sub.value, sub.callback); });

        let err = await this.client.closed();
        this.connected = false;
        if(err) { console.log("NATS Error:", err); }
    }

    protected async Connect(data: any) {
        this.client = await connect(data);
        this.connected = true;
    }

    public async Subscribe(value: string, callback: Function) {
        let size = this.callbacks.size;
        this.callbacks.add({ value, callback });
        if(this.callbacks.size <= size) { return false; }
        
        let sub = this.client.subscribe(value);
        this.subscriptions.add(sub);

        // Should have a handler somewhere
        (async () => { for await (const msg of sub) { callback(sub, this.codec.decode(msg.data)); } })();

        return true;
    }

    public async Publish(value: string, data: any) {
        if(!this.connected) { await this.Connect(this.data); }
        this.client.publish(value, this.codec.encode(JSON.stringify(data)));
    }

    public async Process() {
        // await this.client.drain(); // closes connection after all pubs - error handle will use this
    }
}


// Redis Client