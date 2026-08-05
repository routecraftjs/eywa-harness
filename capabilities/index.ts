// Tickets
import createTicket from "./tickets/create-ticket.js";
import getTicket from "./tickets/get-ticket.js";
import updateTicketStatus from "./tickets/update-ticket-status.js";
import commentOnTicket from "./tickets/comment-on-ticket.js";
import reportGap from "./tickets/report-gap.js";
import listTickets from "./tickets/list-tickets.js";

// Email
import sendEmail from "./email/send-email.js";

// Approvals
import requestApproval from "./approvals/request-approval.js";

// Planka plumbing (internal: not exposed to any persona)
import plankaToken from "./planka/planka-token.js";
import plankaBoard from "./planka/planka-board.js";

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
  listTickets,
  reportGap,
  sendEmail,
  requestApproval,
  knowledgeFind,
  knowledgeRead,
  knowledgeWrite,
  knowledgeAppend,
  // Internal plumbing, reached only by other routes via direct()
  plankaToken,
  plankaBoard,
  // External entry point
  chatWithAria,
];
