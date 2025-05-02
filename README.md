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

## Overview
This repository provides the following:
1. An MCP server, which you can easily replace with your own
2. An express.js application that manages _both_ the SSE and Streamable HTTP transports _and_ OAuth authorization.

This express application is what you plug your credentials and MCP server into.

Note that while this express app implements the required OAuth endpoints including `/authorize` and the Authorization Server Metadata endpoint ([RFC8414](https://datatracker.ietf.org/doc/html/rfc8414)), _it does not implement an OAuth authorization server!_ 

This example proxies OAuth to an upstream OAuth server which supports dynamic client registration ([RFC7591](https://datatracker.ietf.org/doc/html/rfc7591)). To use this example, you will need to bring your own authorization server. We recommend using [Auth0](https://auth0.com); see the ["Setting up OAuth" Section](https://github.com/NapthaAI/http-oauth-mcp-server?tab=readme-ov-file#setting-up-oauth) below.

## Getting Started
To test out our MCP server with streamable HTTP and OAuth support, you have a couple options.

As noted above, the Python MCP SDK does not support these features, so currently you can either plug our remote server into an MCP host like cursor, or into a TypeScript/JavaScript application directly - but not into a Python one.

### Plugging our server into your MCP Host (Cursor / Claude)

### Plugging our server into your agent 


## Deploying your own
Once you've tested our server and you understand the limitations, we recommend deploying your own, with your own OAuth credentials!

### Setting up OAuth
To use this example, you need an OAuth authorization server. _Do not implement this yourself!_ For the purposes of creating our demo, we used [Auth0](https://auth0.com) -- this is a great option, though there are many others.

The MCP specification requires support for an uncommon OAuth feature, specifically [RFC7591](https://datatracker.ietf.org/doc/html/rfc7591), Dynamic Client Registration. The [MCP specification](https://modelcontextprotocol.io/specification/2025-03-2026) specifies that MCP clients and servers should support the Dynamic client registration protocol, so that MCP clients (whever your client transport lives) can obtain Client IDs without user registration. This allows new clients (agents, apps, etc.) to automatically register with new servers. More details on this can be found [in the authorization section of the MCP specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization#2-4-dynamic-client-registration), but this means that unfortunately, you cannot simply proxy directly to a provider like Google or GitHub, which do not support dynamic client registration (they require you to register clients in their UI). 

This leaves you with two options:
1. Pick an upstream OAuth provider like Auth0 which allows you to use OIDC IDPs like Google and GitHub for authentication, and which _does_ support dynamic client registration, or 
2. implement dynamic client registration in the application yourself (i.e., the express application becomes not just a simple OAuth proxy but a complete or partially-complete OAuth server). Cloudflare implemented something like this for their Workers OAuth MCP servers, which we may extend this project with later. You can find that [here](https://github.com/cloudflare/workers-oauth-provider).

For simplicity, we have opted for the former option using Auth0.

To get started:
1. Create an Auth0 account
2. Create at least one connection, e.g. Google or GitHub
3. Promote the connection to a _domain-level connection_. Since new OAuth clients are registered by each MCP client, you can't configure your IDP connections on a per-application/client basis. This means your connections need to be available for all apps in your domain. You can [learn how do this here](https://auth0.com/docs/authenticate/identity-providers/promote-connections-to-domain-level). 
4. Enable Dynamic Client Registration (auth0 also calls this "Dynamic Application Registration"). You can [learn how to do this here](https://auth0.com/docs/get-started/applications/dynamic-client-registration)


## Dependencies
[Bun](https://bun.sh), a fast all-in-one JavaScript runtime, is the recommended runtime and package manager for this repository. Limited compatibility testing has been done with `npm` + `tsc`. 

