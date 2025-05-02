/**
 * This file presents a simple in-memory storage implementation for the OAuth proxy. useful if you are locally debugging
 * or don't want to set up a database or something. don't use this in production
 */
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import createLogger from "logging";
import type { OAuthProxyStorageManager } from "../types";

const logger = createLogger("InMemoryStorage", {
	debugFunction: (...args) => console.log(...args),
});

logger.warn(
	"Warning: InMemoryStorage is not suitable for production use. Consider using RedisStorage",
);

// Local storage for the OAuth Proxy
const clients: Record<string, OAuthClientInformationFull> = {};
const accessTokens: Record<
	string,
	{
		scopes: Array<string>;
		clientId: string;
		accessToken: string;
		idToken: string;
		expiresInSeconds: number;
	}
> = {};

export const InMemoryStorage: OAuthProxyStorageManager = {
	saveClient: async (clientId: string, data: OAuthClientInformationFull) => {
		clients[clientId] = data;
	},
	getClient: async (clientId: string) => {
		return clients[clientId];
	},
	saveAccessToken: async (
		accessToken: string,
		idToken: string,
		clientId: string,
		scope: string,
		expiresInSeconds: number,
	) => {
		accessTokens[accessToken] = {
			scopes: scope.split(" "),
			clientId,
			accessToken,
			idToken,
			expiresInSeconds,
		};
		setTimeout(() => {
			logger.debug("Deleting access token after expiration", accessToken);
			delete accessTokens[accessToken];
		}, expiresInSeconds * 1000);
	},
	getAccessToken: async (accessToken: string) => {
		return accessTokens[accessToken];
	},
};

export default InMemoryStorage;
