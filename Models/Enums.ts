
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
    Decoration,
    // Helper,
    Mod,
    Bot,
    Janitor,
    Admin,
    Owner
}

export enum ChatMessageType {
    Chat,
    Event,
    State,
    Admin,
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