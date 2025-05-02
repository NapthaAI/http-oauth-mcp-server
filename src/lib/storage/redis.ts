/**
 * This file defines a Redis-based storage implementation for the OAuth proxy.
 * This is useful for production use, as it allows the OAuth proxy to be horizontally scalable (if you can solve the transport in-memory issue...)
 *
 */

import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import Redis from "ioredis";
import createLogger from "logging";
import type { OAuthProxyStorageManager } from "../types";

const logger = createLogger("RedisStorage", {
	debugFunction: (...args) => console.log(...args),
});
logger.debug("RedisStorage initializing...");

const redis = new Redis({
	host: "localhost",
	port: 6379,
});
redis.on("connecting", () => logger.debug("Redis connecting..."));
redis.on("connect", () => logger.info("Redis connected!"));
redis.on("error", (err) => logger.error("Redis error", err));
redis.on("close", () => logger.info("Redis closed!"));

export const RedisStorage: OAuthProxyStorageManager = {
	saveClient: async (clientId: string, data: OAuthClientInformationFull) => {
		await redis.set(clientId, JSON.stringify(data));
	},
	getClient: async (clientId: string) => {
		const data = await redis.get(clientId);
		return data ? JSON.parse(data) : undefined;
	},
	saveAccessToken: async (
		{ accessToken, idToken, refreshToken, clientId, scope },
		expiresInSeconds: number,
	) => {
		await redis.setex(
			accessToken,
			expiresInSeconds,
			JSON.stringify({
				idToken,
				refreshToken,
				clientId,
				scopes: scope.split(" "),
			}),
		);
	},
	getAccessToken: async (accessToken: string) => {
		const data = await redis.get(accessToken);
		return data ? JSON.parse(data) : undefined;
	},
};

export default RedisStorage;
