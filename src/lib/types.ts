import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// Define JSON types
export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

// Define the type for the save function
export type SaveClientInfoFunction = (
	clientId: string,
	data: OAuthClientInformationFull,
) => Promise<void>;
export type GetClientInfoFunction = (
	clientId: string,
) => Promise<OAuthClientInformationFull | undefined>;

export type SaveAccessTokenFunction = (
	{
		accessToken,
		idToken,
		refreshToken,
		clientId,
		scope,
	}: {
		accessToken: string;
		idToken?: string;
		refreshToken?: string;
		clientId: string;
		scope: string;
	},
	expiresInSeconds: number,
) => Promise<string>;
export type GetAccessTokenFunction = (accessToken: string) => Promise<
	| {
			scopes: Array<string>;
			clientId: string;
			accessToken: string;
			idToken?: string;
			refreshToken?: string;
			expiresInSeconds: number;
	  }
	| undefined
>;

export type OAuthProxyStorageManager = {
	saveClient: SaveClientInfoFunction;
	getClient: GetClientInfoFunction;
	saveAccessToken: SaveAccessTokenFunction;
	getAccessToken: GetAccessTokenFunction;
};
