import { ChannelData, ChatMessage, RoomData } from "./Interfaces";
import { User } from "./User";

export class Room {

    // #region DB and API
    
    // no db for rooms now, but can easily be added without effecting channel/room logic

    // #endregion

    private data: RoomData;

    constructor(data: RoomData) {
        this.data = data;
    }

    addUser(user: User, socket: WebSocket): boolean {
        this.addSocketToUser(user, socket);
        if(!this.data.users.has(user)) { 
            this.data.users.add(user); 
            return true;
        }

        return false;
    }

    removeUser(user: User, socket: WebSocket): boolean | Error {
        let result = this.removeSocketFromUser(user, socket);
        if(result instanceof Error) { return result; }
        if(user.getSockets().size > 0) { return Error("User has Sockets Still Connected."); }
        return this.data.users.delete(user);
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

    async dispatch(msg: ChatMessage) {
        Array.from(this.data.users).forEach((user) => { user.sendToSockets(msg); });
    }
}