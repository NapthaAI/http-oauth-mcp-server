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

Note that while this express app implements the required OAuth endpoints including `/authorize` and the Authorization Server Metadata endpoint ([RFC8414](https://datatracker.ietf.org/doc/html/rfc8414)), _it does not implement an OAuth authorization server!_ 

This example proxies OAuth to an upstream OAuth server which supports dynamic client registration ([RFC7591](https://datatracker.ietf.org/doc/html/rfc7591)). To use this example, you will need to bring your own authorization server. We recommend using [Auth0](https://auth0.com); see the section below for details.

## Setting up OAuth
To use this example, you need an OAuth authorization server. _Do not implement this yourself!_ For the purposes of creating our demo, we used [Auth0](https://auth0.com) -- this is a great option, though there are many others.

The MCP specification requires support for several uncommon OAuth features:


## Dependencies
[Bun](https://bun.sh), a fast all-in-one JavaScript runtime, is the recommended runtime and package manager for this repository. Limited compatibility testing has been done with `npm` + `tsc`. 

