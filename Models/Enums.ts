
export enum ServiceType {
    Gateway,
    Auth,
    Chat
}

export enum SubscriptionType {
    Paid,
    Gifted,
    Free,
    Other
}

export enum BadgeType {
    Subscription,
    Permission,
    Acknowledgment,
    Other
}

export enum RoleType {
    Other,
    Sub,
    Award,
    Janitor,
    Mod,
    Bot,
    Admin,
    Owner
}

export enum ChatMessageType {
    Chat,
    Event,
    State,
    Admin,
    Error,
    Other
}

export enum Platforms {
    Youtube,
    Twitch,
    Kick,
    Rumble,
    Discord,
    Other
}

// Subscription Level will be a number (100, 200, 300) up to level's allowed per channel

export enum ServerErrorType {
    UndefinedError = 0,
    GenericError = 1,
    BadRequest = 400,
    AuthenticationError = 401,
    MissingResource = 404,
    UnprocessableContent = 422,
    ServerError = 500,
    NotImplemented = 501
}