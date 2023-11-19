// Local Run Server for Dev
import { NATSClient } from "../../Data/Message";
import { Room } from "../../Models/Room";
import { Server } from "../../Models/Server";
import { padLeft } from "../../Utils";

const log = (...args) => {
    let date = new Date();
    let time = `${padLeft(date.getHours())}:${padLeft(date.getMinutes())}:${padLeft(date.getSeconds())}:${padLeft(date.getMilliseconds(), 3)}`;
    console.log(`${time} |`, ...args);
}

const server_one = new Server({
    port: 8000,
    auth: true,
    chat: true,
    dev: true,
    allowedDomains: ["localhost:8000"]
});

const server_two = new Server({
    port: 8001,
    auth: true,
    chat: true,
    dev: true,
    allowedDomains: ["localhost:8001"]
});

// First Param Forces Drop
server_one.DBFormat(true);




log("Dev Service Running...");

// // Runs PUB SUB Test
// const nats = { servers: 'localhost:4222' }
// const room = new Room({ id: 'test-room', name: 'test room', nats: nats });
// const client = new NATSClient(nats);

// setTimeout(() => {
//     log(`Publishing (${'test'})...`);
//     client.Publish('test', { test: true });
// }, 2000);