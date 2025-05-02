import { randomBytes } from "node:crypto";
/**
 * This file presents a simple in-memory storage implementation for the OAuth proxy. useful if you are locally debugging
 * or don't want to set up a database or something. don't use this in production
 */
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type {
	GetAccessTokenFunction,
	OAuthProxyStorageManager,
} from "../types";

// Local storage for the OAuth Proxy
const clients: Record<string, OAuthClientInformationFull> = {};
const accessTokens: Record<
	string,
	Awaited<ReturnType<GetAccessTokenFunction>>
> = {};

export const InMemoryStorage: OAuthProxyStorageManager = {
	saveClient: async (clientId: string, data: OAuthClientInformationFull) => {
		clients[clientId] = data;
	},
	getClient: async (clientId: string) => {
		return clients[clientId];
	},
	saveAccessToken: async (
		{ accessToken, idToken, clientId, scope },
		expiresInSeconds: number,
	) => {
		const locallyIssuedAccessToken = randomBytes(64).toString("hex");

		// save the read access token and other information under the "proxied" access token
		accessTokens[locallyIssuedAccessToken] = {
			scopes: scope?.split(" ") ?? [],
			clientId,
			idToken: idToken ?? "",
			accessToken: accessToken,
			expiresInSeconds,
		};
		setTimeout(() => {
			delete accessTokens[locallyIssuedAccessToken];
		}, expiresInSeconds * 1000);
		return locallyIssuedAccessToken;
	},
	getAccessToken: async (locallyIssuedAccessToken: string) => {
		return accessTokens[locallyIssuedAccessToken];
	},
};

export default InMemoryStorage;
