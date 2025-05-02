# 🌊 Streamable HTTP / SSE MCP Server + OAuth Authorization

## Introduction
This repo provides a reference implementation for creating a remote MCP server that supports the Streamable HTTP & SSE Transports, authorized with OAuth based on the MCP specification.

Note that the MCP server in this repo is logically separate from the application that handles the report SSE + HTTP transports, and from OAuth. 

As a result, you can easily fork this repo, and plug in your own MCP server and OAuth credentials for a working SSE/HTTP + OAuth MCP server with your own functionality. 

## Overview
This repository provides the following:
1. An MCP server, which you can easily replace with your own
2. An express.js application that manages:
    a. the SSE and Streamable HTTP transports
    b. OAuth authorization.

Note that while this express app implements the required OAuth endpoints including `/authorize`, the Authorization Server Metadata endpoint ([RFC8414](https://datatracker.ietf.org/doc/html/rfc8414)), etc.; _it does not implement an OAuth authorization server!_ 

This example proxies OAuth to an upstream OAuth server. To use this example, you will need to bring your own authorization server. We recommend using [Auth0](https://auth0.com); see the section below for details.

## Setting up OAuth
To use this example, you need an OAuth authorization server. _Do not implement this yourself!_ For the purposes of creating our demo, we used [Auth0](https://auth0.com) -- this is a great option, though there are many others.

The MCP specification requires support for several uncommon OAuth features:


## Dependencies
[Bun](https://bun.sh), a fast all-in-one JavaScript runtime, is the recommended runtime and package manager for this repository. Limited compatibility testing has been done with `npm` + `tsc`. 

