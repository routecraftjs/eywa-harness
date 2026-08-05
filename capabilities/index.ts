// Tickets
import createTicket from "./tickets/create-ticket.js";
import getTicket from "./tickets/get-ticket.js";
import updateTicketStatus from "./tickets/update-ticket-status.js";
import commentOnTicket from "./tickets/comment-on-ticket.js";
import reportGap from "./tickets/report-gap.js";

// Email
import sendEmail from "./email/send-email.js";

// Approvals
import requestApproval from "./approvals/request-approval.js";

// Knowledge
import knowledgeFind from "./knowledge/knowledge-find.js";
import knowledgeRead from "./knowledge/knowledge-read.js";
import knowledgeWrite from "./knowledge/knowledge-write.js";
import knowledgeAppend from "./knowledge/knowledge-append.js";

// MCP entrypoint
import chatWithAria from "./mcp/chat-with-aria.js";

export default [
  // Tools the agent calls (direct routes)
  createTicket,
  getTicket,
  updateTicketStatus,
  commentOnTicket,
  reportGap,
  sendEmail,
  requestApproval,
  knowledgeFind,
  knowledgeRead,
  knowledgeWrite,
  knowledgeAppend,
  // External entry point
  chatWithAria,
];
