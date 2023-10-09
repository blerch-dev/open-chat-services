export interface UserData {
    uuid: string,
    name: string,
    role: number,
    auth?: PlatformConnection[],
    subs?: Subscription[],
    hex?: string, // color in chats without class system
    age?: number // epoch ts from account creation
}

export interface RoomData {
    id: string,
    name: string,
    users?: number,
    connections?: number
}

export interface ChannelData {
    owner_id: string,
    id: string,
    name: string,
    domain?: string, // defaults to ${id}.openchat.dev
    badges?: Badge[],
    emotes?: Emote[]
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
    icon: string, // link to icon
    name: string,
    global?: string
}

import { RoleType } from './Enums';
export interface Role {
    type: RoleType,
    badge: Badge,
    name: string,
    global?: string
}

export interface Emote {
    icon: string, // link to icon
    name: string,
    global?: boolean
}

export interface ServerParams {
    port: number,
    api?: boolean,
    chat?: boolean
}

import http from 'http';
export interface ChatServerParams {
    server: http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>
}