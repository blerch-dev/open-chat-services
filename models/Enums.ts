
export enum ServiceType {
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
    Guest,
    Helper,
    Mod,
    Bot,
    Janitor,
    Admin,
    Owner
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