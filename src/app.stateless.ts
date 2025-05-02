import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "dotenv";
import express, {
	type NextFunction,
	type Request,
	type Response,
} from "express";
import createLogger from "logging";
import { InvalidAccessTokenError } from "./lib/errors";
import { ExtendedProxyOAuthServerProvider } from "./lib/extended-oauth-proxy-provider";
import InMemoryStorage from "./lib/storage/in-memory";
import { RedisStorage } from "./lib/storage/redis";
import type { OAuthProxyStorageManager } from "./lib/types";
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
	streamable: { [sessionId: string]: StreamableHTTPServerTransport };
} = {
	streamable: {},
};

let storageStrategy: OAuthProxyStorageManager;
if (process.env.TOKEN_STORAGE_STRATEGY === "redis") {
	logger.info("Using redis storage strategy!");
	storageStrategy = RedisStorage;
} else {
	logger.warn(
		"Using in-memory storage strategy. DO NOT USE THIS IN PRODUCTION!",
	);
	storageStrategy = InMemoryStorage;
}

process.env.TOKEN_STORAGE_STRATEGY === "memory"
	? InMemoryStorage
	: RedisStorage;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up the OAuth Proxy provider; configured in .env to use Naptha's Auth0 tenant
const proxyProvider = new ExtendedProxyOAuthServerProvider({
	endpoints: {
		authorizationUrl: `${OAUTH_AUTHORIZATION_URL}`,
		tokenUrl: `${OAUTH_TOKEN_URL}`,
		revocationUrl: OAUTH_REVOCATION_URL,
		registrationUrl: `${OAUTH_REGISTRATION_URL}`,
	},

	storageManager: storageStrategy, // configure with process.env.TOKEN_STORAGE_STRATEGY
});

// Set up the middleware that verifies the issued bearer tokens. Note that these are NOT
// the auth tokens from the upstream IDP.
const bearerAuthMiddleware = requireBearerAuth({
	provider: proxyProvider,
	requiredScopes: [],
});

// Mount the router that handles the OAuth Proxy's endoints, discovery etc.
app.use(
	mcpAuthRouter({
		provider: proxyProvider,
		issuerUrl: new URL(`${OAUTH_ISSUER_URL}`), // address of issuer, auth0
		baseUrl: new URL(`${THIS_HOSTNAME}`), // address of local server
	}),
);

/**
 * Set up the streamable HTTP MCP router
 */
app.use("/", async (req, res, next) => {
	logger.debug(req.method, req.url, req.headers, req.body);
	await next();
	logger.debug(res.headersSent, res.statusCode);
});
app.post("/mcp", async (req: Request, res: Response, next: NextFunction) => {
	logger.debug("POST /mcp");

	const transport: StreamableHTTPServerTransport =
		new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined, // explicitly disable session ID generation since stateless
		});
	await server.connect(transport);
	await transport.handleRequest(req, res, req.body);

	res.on("close", () => {
		console.log("Closing connection");
		transport.close();
		server.close();
	});
});

app.use("/mcp", async (req: Request, res: Response, next: NextFunction) => {
	if (req.method === "GET" || req.method === "DELETE") {
		console.log(`Unsupported ${req.method} ${req.url} to stateless server`);
		res.writeHead(405).json({
			jsonrpc: "2.0",
			error: {
				code: -32000,
				message: "Method not allowed.",
			},
			id: null,
		});
	}
	return next();
});

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
				id: null,
			});
		} else {
			res.status(500).json({
				jsonrpc: "2.0",
				error: {
					code: -32_000,
					message: "Internal server error",
				},
				id: null,
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
