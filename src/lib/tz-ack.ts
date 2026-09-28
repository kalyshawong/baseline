// Cookie remembering "keep my account timezone" for one userTz|deviceTz pair.
// Shared by the server banner and its client buttons (a "use client" module
// can't export plain constants to server components).
export const TZ_ACK_COOKIE = "bl_tz_ack";
