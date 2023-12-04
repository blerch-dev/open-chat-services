import { WebSocket } from "ws";

import { NATSClient } from "../Data/Message";
import { ChannelData, ChatMessage, RoomData } from "./Interfaces";
import { User } from "./User";

export class Room {

    // #region DB and API
    
    // no db for rooms now, but can easily be added without effecting channel/room logic

    // #endregion

    private data: RoomData;
    private nats: NATSClient;
    private users: Set<User>;

    public SubscriptionValue: string;
    public SubscriptionCallback: Function;

    constructor(data: RoomData) {
        this.data = data;
        this.users = data?.users ?? new Set<User>();

        this.SubscriptionValue = `room-${data.name ?? data.id}`;
        const default_function = (sub, msg) => { this.dispatch(JSON.parse(msg)); }
        this.SubscriptionCallback = data.sub?.callback ?? default_function;
    }

    addUser(user: User, socket: WebSocket): boolean {
        this.addSocketToUser(user, socket);
        if(!this.users.has(user)) { 
            this.users.add(user); 
            return true;
        }

        return false;
    }

    removeUser(user: User, socket: WebSocket): boolean | Error {
        let result = this.removeSocketFromUser(user, socket);
        if(result instanceof Error) { return result; }
        if(user.getSockets().size > 0) { return Error("User has Sockets Still Connected."); }
        return this.users.delete(user);
    }

    addSocketToUser(user: User, socket: WebSocket): boolean {
        user.addSocket(socket);
        return true; // would have to manually check if added, false positives are fine
    }

    removeSocketFromUser(user: User, socket: WebSocket): boolean | Error {
        if(user.getSockets().has(socket)) {
            if(!user.removeSocket(socket)) { return Error(`Failed to Remove Socket from User: ${user.getName()}`); }
            if(user.getSockets().size < 1) { return this.removeUser(user, socket); }
        }
    }

    async dispatch(msg: ChatMessage, min_role_type = 0) {
        Array.from(this.users).forEach((user) => {
            if(min_role_type === 0 || user.hasRolePermission(min_role_type, this.data.id)) { user.sendToSockets(msg); }
        });
    }
}