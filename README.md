# 🌊 HTTP + SSE MCP Server w/ OAuth

## Introduction
This repo provides a reference implementation for creating a remote MCP server that supports the Streamable HTTP & SSE Transports, authorized with OAuth based on the MCP specification.

Note that the MCP server in this repo is logically separate from the application that handles the report SSE + HTTP transports, and from OAuth. 

As a result, you can easily fork this repo, and plug in your own MCP server and OAuth credentials for a working SSE/HTTP + OAuth MCP server with your own functionality. 

> **But, why?**

Great question! The MCP specification added the authorization specification based on OAuth on March 25, 2025. At present, as of May 1, 2025: 
- The Typescript SDK contains many of the building blocks for accomplishing an OAuth-authorized MCP server with streamable HTTP, **but there is no documentation or tutorial** on how to build such a server
- The Python SDK contains neither an implementation of the streamable HTTP transport, nor an implementation of the OAuth building blocks that are present in the typescript SDK
- The Streamable HTTP transport is broadly unsupported by MCP host applications such as Cursor and Claude desktop, though it may be intgrated directly into agents written in JavaScript using the JS/TS SDK's `StreamableHttpClientTransport` class

At [Naptha AI](https://naptha.ai), we really wanted to build an OAuth-authorized MCP server on the streamable HTTP transport, and couldn't find any reference implementations, so we decided to build one ourselves!


## Dependencies
[Bun](https://bun.sh), a fast all-in-one JavaScript runtime, is the recommended runtime and package manager for this repository. Limited compatibility testing has been done with `npm` + `tsc`. 



## Overview
This repository provides the following:
1. An MCP server, which you can easily replace with your own
2. An express.js application that manages _both_ the SSE and Streamable HTTP transports _and_ OAuth authorization.

This express application is what you plug your credentials and MCP server into.

Note that while this express app implements the required OAuth endpoints including `/authorize` and the Authorization Server Metadata endpoint ([RFC8414](https://datatracker.ietf.org/doc/html/rfc8414)), _it does not implement an OAuth authorization server!_ 

This example proxies OAuth to an upstream OAuth server which supports dynamic client registration ([RFC7591](https://datatracker.ietf.org/doc/html/rfc7591)). To use this example, you will need to bring your own authorization server. We recommend using [Auth0](https://auth0.com); see the ["Setting up OAuth" Section](https://github.com/NapthaAI/http-oauth-mcp-server?tab=readme-ov-file#setting-up-oauth) below.


## Configuring your server
### Notes on OAuth & Dynamic Client Registration
To use this example, you need an OAuth authorization server. _Do not implement this yourself!_ For the purposes of creating our demo, we used [Auth0](https://auth0.com) -- this is a great option, though there are many others.

The MCP specification requires support for an uncommon OAuth feature, specifically [RFC7591](https://datatracker.ietf.org/doc/html/rfc7591), Dynamic Client Registration. The [MCP specification](https://modelcontextprotocol.io/specification/2025-03-2026) specifies that MCP clients and servers should support the Dynamic client registration protocol, so that MCP clients (whever your client transport lives) can obtain Client IDs without user registration. This allows new clients (agents, apps, etc.) to automatically register with new servers. More details on this can be found [in the authorization section of the MCP specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-4-dynamic-client-registration), but this means that unfortunately, you cannot simply proxy directly to a provider like Google or GitHub, which do not support dynamic client registration (they require you to register clients in their UI). 

This leaves you with two options:
1. Pick an upstream OAuth provider like Auth0 which allows you to use OIDC IDPs like Google and GitHub for authentication, and which _does_ support dynamic client registration, or 
2. implement dynamic client registration in the application yourself (i.e., the express application becomes not just a simple OAuth proxy but a complete or partially-complete OAuth server). Cloudflare implemented something like this for their Workers OAuth MCP servers, which we may extend this project with later. You can find that [here](https://github.com/cloudflare/workers-oauth-provider).

For simplicity, we have opted for the former option using Auth0. 

> [!NOTE]  
> Since this implementation proxies the upstream OAuth server, the default approach of forwarding the access token from the OAuth server to the client would expose the user's upstream access token to the downstream client & MCP host. This is not suitable for many use-cases, so this approach re-implements some `@modelcontextprotocol/typescript-sdk` classes to fix this issue.

Note that while we are proxying the upstream authorization server, we are _not_ returning the end-user's auth token to the MCP client / host - instead, we are issuing our own, and allowing the client / host to use that token to authorize with our server. This prevents a malicious client or host from abusing the token, or from it being abused if it's leaked.


### Setting up OAuth with Auth0
To get started with Auth0:
1. Create an Auth0 account at [Auth0.com](auth0.com).
2. Create at least one connection to an IDP such as Google or GitHub. You can [learn how to do this here](https://auth0.com/docs/authenticate/identity-providers).
3. Promote the connection to a _domain-level connection_. Since new OAuth clients are registered by each MCP client, you can't configure your IDP connections on a per-application/client basis. This means your connections need to be available for all apps in your domain. You can [learn how do this here](https://auth0.com/docs/authenticate/identity-providers/promote-connections-to-domain-level). 
4. Enable Dynamic Client Registration (auth0 also calls this "Dynamic Application Registration"). You can [learn how to do this here](https://auth0.com/docs/get-started/applications/dynamic-client-registration).

Once all of this has been set up, you will need the following information:
* your Auth0 client ID
* your Auth0 client secret
* your Auth0 tenant domain

Make sure to fill this information into your `.env`. Copy `.env.template` and then update the values with your configurations & secrets.



## Running the server
This repository includes two separate stand-alone servers: 
- a **stateless** implementation of the streamable HTTP server at `src/app.stateless.ts`. This only supports the streamable HTTP transport, and is (theoretically) suitable for serverless deployment
- a **stateful** implementation of both SSE and streamable HTTP at `src/app.stateful.ts`. This app offers both transports, but maintains in-memory state even when using the `redis` storage strategy (connections must be persisted in-memory), so it is not suitable for serverless deployment or trivial horizontal scaling.

You can run either of them with `bun`: 

```shell
bun run src/app.stateless.ts
# or,
bun run src/app.stateful.ts
```

## Putting it All Together
To test out our MCP server with streamable HTTP and OAuth support, you have a couple options.

As noted above, the Python MCP SDK does not support these features, so currently you can either plug our remote server into an MCP host like Cursor or Claude Desktop, or into a TypeScript/JavaScript application directly - but not into a Python one.

### Plugging your server into your MCP Host (Cursor / Claude)
Since most MCP hosts don't support either streamable HTTP (which is superior to SSE in a number of ways) _or_ OAuth, we recommend using the `mcp-remote` npm package which will handle the OAuth authorization, and bridging the remote transport into a STDIO transport for your host.

the command will look like this:

```shell
bunx mcp-remote --transport http-first https://some-domain.server.com/mcp
# or,
npx mcp-remote --transport http-first https://some-domain.server.com/mcp
```

You have a couple of options for the `--transport` option:
- `http-first` (default): Tries HTTP transport first, falls back to SSE if HTTP fails with a 404 error
- `sse-first`: Tries SSE transport first, falls back to HTTP if SSE fails with a 405 error
- `http-only`: Only uses HTTP transport, fails if the server doesn't support it
- `sse-only`: Only uses SSE transport, fails if the server doesn't support it

> [!NOTE] 
> If you launch the _stateless_ version of the server with `src/app.stateless.ts`, the SSE transport is not available, so you should use `--transport http-only`. SSE transport should not be expected to work if you use this entrypoint.


### Plugging you server into your agent 
You can plug your Streamable HTTP server into an agent in JS/TS using `StreamableHTTPClientTransport`. However, this will not work with OAuth-protected servers. Instead, you should use the `Authorization` header on the client side, with a valid access token on the server side. 

You can implement this with client credentials, API keys or something else. That pattern is not supported in this repository, but it would look like this using the [Vercel AI SDK](https://ai-sdk.dev/cookbook/node/mcp-tools#mcp-tools):

```typescript
import { openai } from '@ai-sdk/openai';
import { experimental_createMCPClient as createMcpClient, generateText } from 'ai';
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const mcpClient = await createMcpClient({
  transport: new StreamableHTTPClientTransport(
    new URL("http://localhost:5050/mcp"), {
      requestInit: {
        headers: {
          Authorization: "Bearer YOUR TOKEN HERE",
      }, 
    },
    // TODO add OAuth client provider if you want
    authProvider: undefined,
  }),
});

const tools = await mcpClient.tools();
await generateText({
  model: openai("gpt-4o"),
  prompt: "Hello, world!",
  tools: {
    ...(await mcpClient.tools())
  }
});		

```