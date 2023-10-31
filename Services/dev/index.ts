// Local Run Server for Dev
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