import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "dotenv";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import createLogger from "logging";
import { randomUUID } from "node:crypto";
import { InvalidAccessTokenError } from "./lib/errors";
import { ExtendedProxyOAuthServerProvider } from "./lib/extended-oauth-proxy-provider";
import { RedisStorage } from "./lib/storage/redis";
import { server } from "./mcp-server";
config();

const logger = createLogger(__filename.split("/").pop() ?? "", {
	debugFunction: (...args) => {
		console.log(...args);
	},
});
const {
	OAUTH_ISSUER_URL,
	OAUTH_AUTHORIZATION_URL,
	OAUTH_TOKEN_URL,
	OAUTH_REVOCATION_URL,
	OAUTH_REGISTRATION_URL,
	THIS_HOSTNAME,
} = process.env;

if (
	!OAUTH_ISSUER_URL ||
	!OAUTH_AUTHORIZATION_URL ||
	!OAUTH_TOKEN_URL ||
	!OAUTH_REGISTRATION_URL ||
	!THIS_HOSTNAME
) {
	throw new Error("Missing environment variables");
}

// NOTE ideally we don't do this in memory since it's not horizontally scalable easily
// but these are stateful objects with connections from the client so they can't just
// be written to a database.
const transports: {
	sse: { [sessionId: string]: SSEServerTransport };
	streamable: { [sessionId: string]: StreamableHTTPServerTransport };
} = {
	sse: {},
	streamable: {},
};

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

/**
 * Set up the OAuth Proxy provider; configured in .env to use Naptha's Auth0 tenant
 */
const proxyProvider = new ExtendedProxyOAuthServerProvider({
	endpoints: {
		authorizationUrl: `${OAUTH_AUTHORIZATION_URL}`,
		tokenUrl: `${OAUTH_TOKEN_URL}`,
		revocationUrl: OAUTH_REVOCATION_URL,
		registrationUrl: `${OAUTH_REGISTRATION_URL}`,
	},

	storageManager: RedisStorage,
});

const bearerAuthMiddleware = requireBearerAuth({
	provider: proxyProvider,
	requiredScopes: [],
});

/**
 * Mount the auth router
 */
app.use(
	mcpAuthRouter({
		provider: proxyProvider,
		issuerUrl: new URL(`${OAUTH_ISSUER_URL}`), // address of issuer, auth0
		baseUrl: new URL(`${THIS_HOSTNAME}`), // address of local server
	}),
);

/**
 * Set up the SSE MCP router
 */
app.get("/sse", bearerAuthMiddleware, async (req, res) => {
	logger.debug("SSE headers:", req.headers);
	logger.debug("SSE body:", req.body);

	const transport = new SSEServerTransport("/messages", res);
	transports.sse[transport.sessionId] = transport;

	res.setTimeout(1_000 * 60 * 60 * 6); // 6 hours

	res.on("close", () => {
		delete transports.sse[transport.sessionId];
	});

	await server.connect(transport);
});

// Legacy message endpoint for older clients
app.post("/messages", bearerAuthMiddleware, async (req, res) => {
	const sessionId = req.query.sessionId as string;
	logger.debug("SSE", sessionId, "Received message");
	const transport = transports.sse[sessionId];
	if (transport) {
		logger.debug("SSE", sessionId, "Transport found for sessionId");
		await transport.handlePostMessage(req, res, req.body);
		logger.debug(
			"SSE",
			sessionId,
			"Message handled by transport for sessionId",
		);
	} else {
		logger.warn("SSE", sessionId, "No transport found for sessionId");
		res.status(400).send("No transport found for sessionId");
	}
});

/**
 * Set up the streamable HTTP MCP router
 */
app.use("/mcp", async (req, res, next) => {
	logger.debug(req.method, req.url, req.headers, req.body);
	await next();
	logger.debug(res.headersSent, res.statusCode);
});
app.post("/mcp", bearerAuthMiddleware, async (req, res, next) => {
	const sessionId = req.headers["mcp-session-id"] as string | undefined;
	logger.info("Streamable", "Received message for session", sessionId);
	logger.debug(req.body);
	logger.debug(
		"Streamable",
		"is initialize request?",
		isInitializeRequest(req.body),
	);
	let transport: StreamableHTTPServerTransport;

	// If the sessionID is set and it's associated with a transport, use it
	if (sessionId && transports.streamable[sessionId]) {
		transport = transports.streamable[sessionId];
		logger.info("Streamable", "Transport found for sessionId", sessionId);

		// if the session id IS NOT available and it's an initialize request, set up a new one
	} else if (!sessionId && isInitializeRequest(req.body)) {
		logger.info("Streamable", "Setting up a new transport");
		// Create a new transport with a UUID as sesssion ID; saving it to the transports object
		transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: randomUUID,
			onsessioninitialized(sessionId) {
				transports.streamable[sessionId] = transport;
			},
		});

		transport.onclose = () => {
			if (transport.sessionId)
				delete transports.streamable[transport.sessionId];
		};
		logger.info("Streamable", transport.sessionId, "Transport constructed");

		// connect to the new server
		await server.connect(transport);
		logger.info(
			"Streamable",
			transport.sessionId,
			"Server connected to transport",
		);
	} else {
		logger.warn("Streamable", sessionId, "No transport found for sessionId");
		res.status(400).json({
			jsonrpc: "2.0",
			error: {
				code: -32_000,
				message: "Bad request: no valid session ID provided",
			},
			id: null,
		});
		return next();
	}

	await transport.handleRequest(req, res, req.body);
	logger.info(
		"Streamable",
		"Message handled by transport for session",
		sessionId,
	);
});

// Reusable handler for GET and delete requests

const handleSessionRequest = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const sessionId = req.headers["mcp-session-id"] as string | undefined;
	if (!sessionId || !transports.streamable[sessionId]) {
		logger.warn("Streamable", sessionId, "No transport found for sessionId");
		res.status(400).json({
			jsonrpc: "2.0",
			error: {},
		});
		return next();
	}
	const transport = transports.streamable[sessionId];
	await transport.handleRequest(req, res);
};

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
	logger.info("Error", error);
	if (!res.headersSent) {
		if (error instanceof InvalidAccessTokenError) {
			res.status(401).json({
				jsonrpc: "2.0",
				error: {
					code: -32_000,
					message: "Invalid access token",
				},
			});
		} else {
			res.status(500).json({
				code: -32_000,
				message: "Internal server error",
			});
		}
	} else {
		logger.warn("headers already sent so no response sent");
	}
});
const httpServer = app.listen(process.env.PORT ?? 5050, () => {
	logger.info(`Server is running on port ${process.env.PORT ?? 5050}`);
});

//httpServer.setTimeout(1_000 * 60 * 60 * 6); // 6 hours
