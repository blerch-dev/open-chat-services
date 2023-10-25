import { Server } from "./models/Server";

const app = new Server({
    port: 8000,
    chat: true,
    dev: true,
    allowedDomains: ["localhost:8000"]
});