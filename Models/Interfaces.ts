import { DatabaseResponse } from '../Utils'
export interface Model { // public fields/methods only
    toJSON(): any,
    DBInsertSafe(callback: (str: string, val: any[]) => Promise<DatabaseResponse>): Promise<any>
}

export interface UserData {
    uuid: string,
    name: string,
    status?: number,
    auth?: PlatformConnection[],
    subs?: Subscription[],
    roles?: Role[],
    hex?: string, // color in chats without class system
    age?: number // epoch ts from account creation
    last?: number // epoch of last long session generation (every other week)
}

import { NATSClient } from '../Data';
import { User } from './User';
export interface RoomData {
    id: string,
    name: string,
    users?: Set<User>,
    connections?: number,
    sub?: {
        value: string,
        callback: any
    }
}

export interface ChannelData {
    id: string, // channel id will always represent a room id
    slug: string,
    owner_uuid: string,
    name: string, // defaults to slug
    domain?: string, // defaults to ${slug ?? id}.openchat.dev
    icon?: string,
    embeds?: {
        twitch?: string,
        youtube?: string,
        kick?: string,
        rumble?: string
    },

    badges?: Badge[],
    emotes?: Emote[],
    roles?: (Role)[]
}

import { Platforms } from './Enums';
export interface PlatformConnection {
    platform: Platforms,
    id: string,
    name: string,
    callback?: string, // url for custom platforms
}

import { SubscriptionType } from './Enums';
export interface Subscription {
    type: SubscriptionType,
    date: number, // epoch ts from sub start
    length: number // add to date to find expire
}

export interface Badge {
    id: number,
    icon: string, // link to icon
    name: string,
    channel_id?: string
}

import { RoleType } from './Enums';
export interface Role {
    id: number,
    type: RoleType,
    badge: Badge,
    name: string,
    channel_id?: string
}

export interface Emote {
    icon: string, // link to icon
    name: string,
    channel_id?: string
}

export interface ServerParams {
    port: number,
    dev?: boolean,
    auth?: boolean,
    chat?: boolean,
    nats?: any,
    allowedDomains?: string[]
}

import { Server } from './Server';
export interface AuthServerParams {
    server: Server
}

import { Server as HTTPServer, IncomingMessage, ServerResponse } from "http";
export interface ChatServerParams {
    server: Server,
    listener: HTTPServer<typeof IncomingMessage, typeof ServerResponse>
}

import { ChatMessageType } from './Enums';
export interface ChatMessage {
    type: ChatMessageType,
    value: string,
    meta: any,

    // Matches Message Type - Optionally after value
    event?: any,
    state?: any,
    admin?: any
}