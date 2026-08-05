import heartbeat from "./heartbeat.js";
import processInbox from "./process-inbox.js";
import processTicketEvent from "./process-ticket-event.js";
import weeklyDigest from "./weekly-digest.js";

export default [processInbox, processTicketEvent, weeklyDigest, heartbeat];
