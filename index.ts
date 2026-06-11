export { craftConfig } from "./craft.config.js";

import capabilities from "./capabilities/index.js";
import routes from "./routes/index.js";

// Routes (entry points) plus capabilities (the agent's tools and MCP surface).
// Both kinds are flat arrays of `craft()` builders; Routecraft starts them all.
export default [...routes, ...capabilities];
