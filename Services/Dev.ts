// Local Run Server for Dev
import { Server } from "../Models/Server";
import { padLeft } from "../Utils";

declare global {
    interface Console {
        snap: (...args) => void
    }
}

console.snap = (...args) => {
    let date = new Date();
    let time = `${padLeft(date.getHours())}:${padLeft(date.getMinutes())}:${padLeft(date.getSeconds())}:${padLeft(date.getMilliseconds(), 3)}`;
    console.log(`${time} |`, ...args);
}

const ports = [8000, 8001];
const servers = [];

for(let i = 0; i < ports.length; i++) {
    servers.push(new Server({
        port: ports[i],
        auth: true,
        chat: true,
        dev: true,
        allowedDomains: [`localhost:${ports[i]}`]
    }))
}

// First Param Forces Drop
servers[0]?.DBFormat(true);

console.snap(`Dev Service Running on Ports: [${ports.join(', ')}]...`);

// // Runs PUB SUB Test
// const nats = { servers: 'localhost:4222' }
// const room = new Room({ id: 'test-room', name: 'test room', nats: nats });
// const client = new NATSClient(nats);

// setTimeout(() => {
//     log(`Publishing (${'test'})...`);
//     client.Publish('test', { test: true });
// }, 2000);