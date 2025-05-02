import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import {
	InvalidTokenError,
	ServerError,
} from "@modelcontextprotocol/sdk/server/auth/errors.js";

import type { AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import {
	ProxyOAuthServerProvider,
	type ProxyOptions,
} from "@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js";
import {
	type OAuthClientInformationFull,
	OAuthClientInformationFullSchema,
	type OAuthTokens,
	OAuthTokensSchema,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Response } from "express";
import createLogger from "logging";
import type { OAuthProxyStorageManager } from "./types";

const logger = createLogger(__filename.split("/").pop() ?? "", {
	debugFunction: (...args) => {
		console.log(...args);
	},
});

export type ExtendedOAuthTokens = OAuthTokens & {
	id_token?: string;
};

/**
 * This type extends the ProxyOptions to add a saveClient method.
 * This can be provided by the server implementation for storing client information.
 */
export type ExtendedProxyOptions = Omit<
	ProxyOptions,
	"getClient" | "verifyAccessToken"
> & {
	storageManager: OAuthProxyStorageManager;
};

/**
 * This class extends the ProxyOAuthServerProvider to add a saveClient method.
 * That can be provided by the server implementation for storing client information.
 *
 * This way we don't have to hard-code return values like in the example
 */
export class ExtendedProxyOAuthServerProvider extends ProxyOAuthServerProvider {
	public readonly storageManager: OAuthProxyStorageManager;

	constructor(options: ExtendedProxyOptions) {
		// call the super constructor, but instead of having the user specify a custom getClient function like in the middleware,
		// we'll use the storageManager.getClient function
		super({
			...options,
			getClient: options.storageManager.getClient,
			verifyAccessToken: async (locallyIssuedAccessToken: string) => {
				const data = await this.storageManager.getAccessToken(
					locallyIssuedAccessToken,
				);
				if (!data) {
					// This will return a 401 to the client, resulting in auth
					throw new InvalidTokenError("Invalid access token");
				}
				return {
					token: locallyIssuedAccessToken, // NOT the upstream IDP token.
					scopes: data.scopes,
					clientId: data.clientId,
					expiresInSeconds: data.expiresInSeconds,
				};
			},
		});
		this.storageManager = options.storageManager;
	}

	public override get clientsStore(): OAuthRegisteredClientsStore {
		const registrationUrl = this._endpoints.registrationUrl;
		return {
			getClient: this.storageManager.getClient,
			...(registrationUrl && {
				registerClient: async (client: OAuthClientInformationFull) => {
					const response = await fetch(registrationUrl, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify(client),
					});

					if (!response.ok) {
						throw new ServerError(
							`Client registration failed: ${response.status}`,
						);
					}

					const data = await response.json();
					const parsedClient = OAuthClientInformationFullSchema.parse(data);

					/**
					 * NOTE this is the only change to this function from the original implementation
					 * There's nowehere else that this information can be accessed.
					 *
					 * See @file{src/server/auth/handlers/register.ts}
					 */
					await this.storageManager.saveClient(
						parsedClient.client_id,
						parsedClient,
					);

					return parsedClient;
				},
			}),
		};
	}

	/**
	 * Using this overridden method so we can do some logging and stuff
	 */
	public override async exchangeAuthorizationCode(
		client: OAuthClientInformationFull,
		authorizationCode: string,
		codeVerifier?: string,
	): Promise<OAuthTokens> {
		const redirectUri = client.redirect_uris[0];
		if (redirectUri) {
			logger.debug(
				"Exchanging authorization code with client redirect URI: ",
				redirectUri,
				authorizationCode,
				codeVerifier,
			);
		} else {
			logger.error(
				"No redirect URI found for client",
				client.client_id,
				client,
			);
			throw new ServerError("No redirect URI found for client");
		}
		const params = new URLSearchParams({
			grant_type: "authorization_code",
			client_id: client.client_id,
			redirect_uri: redirectUri,
			code: authorizationCode,
		});

		if (client.client_secret) {
			params.append("client_secret", client.client_secret);
		}

		if (codeVerifier) {
			params.append("code_verifier", codeVerifier);
		}

		const response = await fetch(this._endpoints.tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params.toString(),
		});

		if (!response.ok) {
			logger.error(
				"Token exchange failed",
				response.status,
				response.statusText,
			);
			logger.error("JSON:", await response.json());
			throw new ServerError(`Token exchange failed: ${response.status}`);
		}

		const data = (await response.json()) as ExtendedOAuthTokens;
		logger.debug("Saving access token", data.access_token);
		const locallyIssuedAccessToken = await this.storageManager.saveAccessToken(
			{
				accessToken: data.access_token,
				idToken: data.id_token,
				refreshToken: data.refresh_token,
				clientId: client.client_id,
				scope: data.scope ?? "",
			},
			data.expires_in ?? 86400, // default to 1 day
		);

		return OAuthTokensSchema.parse({
			...data,
			access_token: locallyIssuedAccessToken,
		});
	}

	public override async authorize(
		client: OAuthClientInformationFull,
		params: AuthorizationParams,
		res: Response,
	): Promise<void> {
		// Start with required OAuth parameters
		const targetUrl = new URL(this._endpoints.authorizationUrl);
		const searchParams = new URLSearchParams({
			client_id: client.client_id,
			response_type: "code",
			redirect_uri: params.redirectUri,
			code_challenge: params.codeChallenge,
			code_challenge_method: "S256",
		});

		logger.debug("authorize", {
			client,
			params,
			targetUrl,
			searchParams,
		});

		// Add optional standard OAuth parameters
		if (params.state) searchParams.set("state", params.state);

		searchParams.set(
			"scope",
			params.scopes?.length
				? params.scopes.join(" ")
				: ["email", "profile", "openid"].join(" "),
		);

		targetUrl.search = searchParams.toString();
		res.redirect(targetUrl.toString());
	}
}
