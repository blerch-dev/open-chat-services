// Local Run Server for Dev
import { NATSClient } from "../../Data/Message";
import { Room } from "../../Models/Room";
import { Server } from "../../Models/Server";

const app = new Server({
    port: 8000,
    auth: true,
    chat: true,
    dev: true,
    allowedDomains: ["localhost:8000"]
});

// First Param Forces Drop
app.DBFormat(true);

const room = new Room({ id: 'test-room', name: 'test room' });
const client = new NATSClient({ port: 4222 });
setTimeout(() => {
    console.log("Publishing...");
    client.Publish('test', { test: true });
}, 2000);