import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { NextFunction, Request, Response } from "express";
import express from "express";
import { server } from "./mcp-server";

const app = express();
// TODO need the auth stuff
app.post("/mcp", async (req: Request, res: Response, next: NextFunction) => {
	console.log("POST /mcp");

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
