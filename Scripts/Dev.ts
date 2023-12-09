// Local Run Server for Dev
import { AuthService, ChatService, GatewayService } from "../Services";
import { padLeft } from "../Utils";

declare global {
    interface Console {
        snap: (...args) => void,
        custom: (...args) => void
    }
}

// Logs to Terminal - Prod will Log to File
console.snap = (...args) => {
    let date = new Date();
    let time = `${padLeft(date.getHours())}:${padLeft(date.getMinutes())}:${padLeft(date.getSeconds())}:${padLeft(date.getMilliseconds(), 3)}`;
    console.log(`${time} |`, ...args);
}

let target = { auth: [], chat: [], servers: [] }
const domain = process.argv.indexOf('-d') >= 0 ? process.argv[process.argv.indexOf('-d') + 1] : 'localhost';

for(let i = 0; i < process.argv.length; i++) {
    if(process.argv[i] === '-a') { target.auth = process.argv[i + 1].split(','); }
    else if(process.argv[i] === '-c') { target.chat = process.argv[i + 1].split(','); }
}

if(target.auth.length === 0) { target.auth = ['8000']; }
target.auth.forEach((port, index) => {
    target.servers.push(new AuthService(port, domain));
    if(index === 0) { target.servers[target.servers.length - 1].DBFormat(); }
});

target.chat.forEach((port) => {
    target.servers.push(new ChatService(port, domain));
});

// Gateway (Required) - Domain Here is Origin List
target.servers.push(new GatewayService(80, domain, true, [...target.servers]));

console.snap(`Dev Services\n - ${target.servers.map(s => s.ServiceType()).join('\n - ')}`);

// // Runs PUB SUB Test
// const nats = { servers: 'localhost:4222' }
// const room = new Room({ id: 'test-room', name: 'test room', nats: nats });
// const client = new NATSClient(nats);

// setTimeout(() => {
//     log(`Publishing (${'test'})...`);
//     client.Publish('test', { test: true });
// }, 2000);